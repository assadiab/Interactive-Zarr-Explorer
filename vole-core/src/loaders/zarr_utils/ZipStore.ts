import type { AbsolutePath, AsyncReadable } from "zarrita";
import * as zip from "@zip.js/zip.js";

// Decompress inline rather than spawning nested workers. The OME-Zarr loader
// already runs inside a Web Worker, and nested workers are unreliable across
// browsers. Only the DEFLATE fallback path uses zip.js decompression; STORE
// entries (recommended, see note below) bypass it entirely.
zip.configure({ useWebWorkers: false });

const META_FILENAMES = ["zarr.json", ".zgroup", ".zattrs", ".zarray"];

/** zip local file header is 30 bytes before the variable-length name + extra fields. */
const LOCAL_HEADER_FIXED_SIZE = 30;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const COMPRESSION_STORED = 0;

/** Per-entry index record: enough to read the bytes without re-touching zip.js. */
type IndexEntry = {
  /** Byte offset of the entry's *data* within the zip Blob (after the local header). */
  dataStart: number;
  /** Compressed (== stored, for STORE) byte length. */
  compressedSize: number;
  /** Compression method (0 = STORED). */
  method: number;
  /** The zip.js entry, kept only for the DEFLATE fallback. */
  entry: zip.FileEntry;
};

/** How many local headers to resolve in parallel while building the index. */
const INDEX_CONCURRENCY = 32;

/**
 * A zarrita store that reads an OME-Zarr directly from a local `.zip` Blob/File
 * with **lazy, per-chunk** access. No HTTP server and no full extraction.
 *
 * How it stays lazy AND parallel:
 *  - `zip.js` reads only the zip's *central directory* (at the end of the file)
 *    once to build a filename -> entry index (this is zip64-safe).
 *  - Each `get(key)` for a **STORE**-mode entry reads the entry's bytes with a
 *    direct, stateless `Blob.slice()` — no zip.js reader lock, no CRC pass, no
 *    codec pipeline. This is the critical perf property: `Blob.slice()` calls do
 *    not serialize, so the loader's concurrent chunk requests actually run in
 *    parallel (zip.js's shared `ZipReader` would serialize every read behind a
 *    single lock and recompute CRC32 on each chunk on the worker thread).
 *  - DEFLATE entries fall back to `entry.getData()`; correctness over speed.
 *
 * Performance note: zip the `.ome.zarr` in **STORE** mode (no zip compression).
 * Zarr chunks are already codec-compressed (blosc/zstd), so zip deflate just
 * double-compresses and forces a wasted inflate on every `get`. With STORE,
 * `get` is a plain byte slice and matches the speed of an unzipped directory.
 *
 * The zarr root may sit at the zip root or in a nested folder (e.g.
 * `image.ome.zarr/...`). The folder is auto-detected; pass `rootPath` to force it.
 */
export default class ZipStore implements AsyncReadable<unknown> {
  private blob: Blob;
  /** In-zip path to the zarr root, normalized to "" or "dir/" (with trailing slash). */
  private prefix: string;
  private prefixExplicit: boolean;
  private indexPromise?: Promise<Map<string, IndexEntry>>;

  constructor(zipData: Blob, rootPath?: string) {
    this.blob = zipData;
    this.prefixExplicit = rootPath !== undefined && rootPath !== "";
    this.prefix = normalizePrefix(rootPath ?? "");
  }

  private async buildIndex(): Promise<Map<string, IndexEntry>> {
    const reader = new zip.ZipReader(new zip.BlobReader(this.blob));
    const entries = await reader.getEntries();
    const files = entries.filter((e): e is zip.FileEntry => !e.directory);

    // Resolve each entry's *data* offset once, up front, by reading its local
    // file header. Doing it here (concurrently) means every later `get()` is a
    // single `Blob.slice()` of the data — no per-read header slice. The header's
    // extra-field length can differ from the central directory's, so the data
    // start must be read from the local header, not derived from it.
    const map = new Map<string, IndexEntry>();
    for (let i = 0; i < files.length; i += INDEX_CONCURRENCY) {
      const batch = files.slice(i, i + INDEX_CONCURRENCY);
      const located = await Promise.all(batch.map((e) => this.locateData(e)));
      batch.forEach((e, j) => {
        const loc = located[j];
        map.set(e.filename, {
          dataStart: loc.dataStart,
          compressedSize: e.compressedSize,
          method: loc.method,
          entry: e,
        });
      });
    }
    if (!this.prefixExplicit) {
      this.prefix = detectZarrRootPrefix(map);
    }
    return map;
  }

  /** Read an entry's local file header to find where its data starts and how it's stored. */
  private async locateData(entry: zip.FileEntry): Promise<{ dataStart: number; method: number }> {
    const headerBuf = await this.blob
      .slice(entry.offset, entry.offset + LOCAL_HEADER_FIXED_SIZE)
      .arrayBuffer();
    const header = new DataView(headerBuf);
    if (header.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE) {
      // Unexpected layout — mark as non-STORED so `get` falls back to zip.js.
      return { dataStart: -1, method: -1 };
    }
    const method = header.getUint16(8, true);
    const nameLen = header.getUint16(26, true);
    const extraLen = header.getUint16(28, true);
    return { dataStart: entry.offset + LOCAL_HEADER_FIXED_SIZE + nameLen + extraLen, method };
  }

  private index(): Promise<Map<string, IndexEntry>> {
    if (!this.indexPromise) {
      this.indexPromise = this.buildIndex();
    }
    return this.indexPromise;
  }

  async get(key: AbsolutePath, _opts?: unknown): Promise<Uint8Array | undefined> {
    const entries = await this.index();
    const relKey = key.replace(/^\/+/, "");
    const record = entries.get(this.prefix + relKey);
    if (!record) {
      // Missing key => zarrita treats it as "not present" (e.g. probing for
      // optional .zattrs or v2 vs v3 metadata). Must be undefined, not a throw.
      return undefined;
    }

    if (record.method === COMPRESSION_STORED) {
      // Fast path: stored uncompressed and the data offset was resolved at index
      // build time, so this is a single, stateless `Blob.slice()` — fully
      // parallel, no zip.js reader lock, no CRC recompute, no header re-read.
      const buf = await this.blob.slice(record.dataStart, record.dataStart + record.compressedSize).arrayBuffer();
      return new Uint8Array(buf);
    }

    // Compressed entry (e.g. DEFLATE) or an unexpected local header: defer to
    // zip.js for correct inflation.
    return record.entry.getData(new zip.Uint8ArrayWriter());
  }
}

/** Strip leading slashes, collapse trailing slash to exactly one (or empty). */
function normalizePrefix(rootPath: string): string {
  const trimmed = rootPath.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? trimmed + "/" : "";
}

/**
 * Find the directory containing the shallowest zarr group/array metadata file
 * and return it as a normalized prefix. Lets a user drop in a zip whether the
 * `.ome.zarr` is at the root or nested one level deep.
 */
function detectZarrRootPrefix(entries: Map<string, IndexEntry>): string {
  let best: string | undefined;
  let bestDepth = Infinity;
  for (const filename of entries.keys()) {
    const slash = filename.lastIndexOf("/");
    const base = slash === -1 ? filename : filename.slice(slash + 1);
    if (!META_FILENAMES.includes(base)) {
      continue;
    }
    const dir = slash === -1 ? "" : filename.slice(0, slash + 1);
    const depth = dir === "" ? 0 : dir.split("/").length - 1;
    if (depth < bestDepth) {
      bestDepth = depth;
      best = dir;
    }
  }
  return best ?? "";
}
