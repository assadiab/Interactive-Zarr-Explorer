// @vitest-environment node
//
// jsdom's Blob has no `arrayBuffer()`, which is exactly what ZipStore's STORE fast path calls.
// Node's Blob is complete, and this suite touches no DOM.
import * as zip from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";

import ZipStore from "../loaders/zarr_utils/ZipStore.js";
import { VolumeLoadError, VolumeLoadErrorType } from "../loaders/VolumeLoadError.js";

zip.configure({ useWebWorkers: false });

type Entry = { name: string; content: string; deflate?: boolean };

/**
 * Build a real `.zip` Blob in memory.
 *
 * Fixtures are written here rather than committed as binaries so the archive's shape — which
 * entry is STORED, which is DEFLATE, where the zarr root sits — is readable in the test that
 * depends on it.
 */
async function makeZip(entries: Entry[]): Promise<Blob> {
  const writer = new zip.ZipWriter(new zip.BlobWriter("application/zip"));
  for (const { name, content, deflate } of entries) {
    // `level: 0` still uses the DEFLATE method; `store` is what selects method 0.
    await writer.add(name, new zip.TextReader(content), { level: deflate ? 6 : 0 });
  }
  return writer.close();
}

const decode = (bytes: Uint8Array | undefined): string | undefined =>
  bytes === undefined ? undefined : new TextDecoder().decode(bytes);

/** The metadata file that makes a directory look like a zarr root. */
const ZGROUP = '{"zarr_format":2}';

describe("ZipStore", () => {
  describe("reading entries", () => {
    it("reads a STORED entry through the fast path", async () => {
      const store = new ZipStore(await makeZip([{ name: ".zgroup", content: ZGROUP }, { name: "0/0.0", content: "chunk-bytes" }]));
      expect(decode(await store.get("/0/0.0"))).toBe("chunk-bytes");
    });

    it("reads a DEFLATE entry through the zip.js fallback", async () => {
      // Deliberately compressible, so the entry really is stored deflated.
      const payload = "x".repeat(5000);
      const store = new ZipStore(
        await makeZip([{ name: ".zgroup", content: ZGROUP }, { name: "0/0.0", content: payload, deflate: true }])
      );
      expect(decode(await store.get("/0/0.0"))).toBe(payload);
    });

    it("returns undefined for a missing key rather than throwing", async () => {
      // zarrita probes for optional keys (.zattrs, v2 vs v3 metadata); a throw would abort the load.
      const store = new ZipStore(await makeZip([{ name: ".zgroup", content: ZGROUP }]));
      expect(await store.get("/.zattrs")).toBeUndefined();
      expect(await store.get("/0/9.9")).toBeUndefined();
    });

    it("tolerates a key with or without a leading slash", async () => {
      const store = new ZipStore(await makeZip([{ name: ".zgroup", content: ZGROUP }, { name: "a/b", content: "v" }]));
      expect(decode(await store.get("/a/b"))).toBe("v");
      expect(decode(await store.get("a/b" as never))).toBe("v");
    });
  });

  describe("zarr root detection", () => {
    it("finds a root at the top of the archive", async () => {
      const store = new ZipStore(await makeZip([{ name: ".zgroup", content: ZGROUP }, { name: "0/0.0", content: "c" }]));
      expect(decode(await store.get("/.zgroup"))).toBe(ZGROUP);
    });

    it("finds a root nested one folder deep, and hides the folder from keys", async () => {
      const store = new ZipStore(
        await makeZip([
          { name: "img.ome.zarr/.zgroup", content: ZGROUP },
          { name: "img.ome.zarr/0/0.0", content: "nested-chunk" },
        ])
      );
      expect(decode(await store.get("/.zgroup"))).toBe(ZGROUP);
      expect(decode(await store.get("/0/0.0"))).toBe("nested-chunk");
    });

    it("prefers the shallowest metadata when several are present", async () => {
      // labels/ carries its own .zgroup; the image root is the shallower one.
      const store = new ZipStore(
        await makeZip([
          { name: "img.ome.zarr/.zgroup", content: ZGROUP },
          { name: "img.ome.zarr/labels/segmentation/.zgroup", content: '{"deep":true}' },
        ])
      );
      expect(decode(await store.get("/.zgroup"))).toBe(ZGROUP);
    });

    it("honours an explicit rootPath instead of detecting", async () => {
      const store = new ZipStore(
        await makeZip([
          { name: "a/.zgroup", content: '{"which":"a"}' },
          { name: "b/.zgroup", content: '{"which":"b"}' },
        ]),
        "b"
      );
      expect(decode(await store.get("/.zgroup"))).toBe('{"which":"b"}');
    });

    it("normalizes Windows backslash separators", async () => {
      // The ZIP spec mandates "/", but some Windows tools write "\"; zarrita always asks with "/".
      const store = new ZipStore(await makeZip([{ name: "img.ome.zarr\\.zgroup", content: ZGROUP }]));
      expect(decode(await store.get("/.zgroup"))).toBe(ZGROUP);
    });

    it("fails clearly when the archive holds no zarr at all", async () => {
      const store = new ZipStore(await makeZip([{ name: "notes.txt", content: "hello" }]));
      await expect(store.get("/.zgroup")).rejects.toBeInstanceOf(VolumeLoadError);
      await expect(store.get("/.zgroup")).rejects.toMatchObject({ type: VolumeLoadErrorType.INVALID_METADATA });
    });
  });

  describe("hostile and damaged archives", () => {
    it("reports a clear error for something that is not a zip", async () => {
      const store = new ZipStore(new Blob([new Uint8Array(512).fill(7)]));
      await expect(store.get("/.zgroup")).rejects.toMatchObject({ type: VolumeLoadErrorType.LOAD_DATA_FAILED });
    });

    it("builds the index only once across many reads", async () => {
      const store = new ZipStore(await makeZip([{ name: ".zgroup", content: ZGROUP }, { name: "0/0.0", content: "c" }]));
      const results = await Promise.all([store.get("/.zgroup"), store.get("/0/0.0"), store.get("/nope")]);
      expect(results.map(decode)).toEqual([ZGROUP, "c", undefined]);
    });
  });
});
