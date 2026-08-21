import { describe, expect, it } from "@jest/globals";
import type { Readable } from "@zarrita/storage";

import { loadMeasurements } from "../loadMeasurements";
import { makeObjectKey } from "../objectKey";

const enc = new TextEncoder();

/**
 * A zarrita store backed by a plain map.
 *
 * Fixtures are built in memory rather than committed as binaries so each test says, in
 * readable form, exactly which metadata layout it exercises — which is the whole point
 * here, since the two layouts (Zarr v2 and v3) are what we are covering.
 */
function memoryStore(entries: Record<string, Uint8Array | string>): Readable {
  const map = new Map<string, Uint8Array>();
  for (const [key, value] of Object.entries(entries)) {
    map.set(key, typeof value === "string" ? enc.encode(value) : value);
  }
  return { get: async (key: string) => map.get(key) };
}

/** numcodecs `vlen-utf8`: u32 count, then per string u32 byte-length + UTF-8 bytes. */
function vlenUtf8(strings: string[]): Uint8Array {
  const parts = strings.map((s) => enc.encode(s));
  const buf = new ArrayBuffer(4 + parts.reduce((sum, p) => sum + 4 + p.length, 0));
  const view = new DataView(buf);
  const out = new Uint8Array(buf);
  view.setUint32(0, strings.length, true);
  let offset = 4;
  for (const part of parts) {
    view.setUint32(offset, part.length, true);
    offset += 4;
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const i64 = (values: number[]): Uint8Array => new Uint8Array(BigInt64Array.from(values.map(BigInt)).buffer);
const f32 = (values: number[]): Uint8Array => new Uint8Array(Float32Array.from(values).buffer);

/** Zarr v2 AnnData table: `.zarray` metadata, `.` chunk separator, no compressor. */
function v2Table(labelIds: number[], featureNames: string[], x: number[][]): Readable {
  const p = "/tables/measurements";
  const nObs = labelIds.length;
  return memoryStore({
    [`${p}/obs/label_id/.zarray`]: JSON.stringify({
      shape: [nObs], chunks: [nObs], dtype: "<i8", fill_value: 0, order: "C",
      filters: null, dimension_separator: ".", compressor: null, zarr_format: 2,
    }),
    [`${p}/obs/label_id/0`]: i64(labelIds),
    [`${p}/var/_index/.zarray`]: JSON.stringify({
      shape: [featureNames.length], chunks: [featureNames.length], dtype: "|O", fill_value: "",
      order: "C", filters: [{ id: "vlen-utf8" }], dimension_separator: ".",
      compressor: null, zarr_format: 2,
    }),
    [`${p}/var/_index/0`]: vlenUtf8(featureNames),
    [`${p}/X/.zarray`]: JSON.stringify({
      shape: [nObs, featureNames.length], chunks: [nObs, featureNames.length], dtype: "<f4",
      fill_value: 0, order: "C", filters: null, dimension_separator: ".",
      compressor: null, zarr_format: 2,
    }),
    [`${p}/X/0.0`]: f32(x.flat()),
  });
}

/** Zarr v3 equivalent: `zarr.json` metadata, `c/` chunk key prefix. */
function v3Table(labelIds: number[], featureNames: string[], x: number[][]): Readable {
  const p = "/tables/measurements";
  const nObs = labelIds.length;
  const meta = (shape: number[], dataType: string, extra: object = {}): string =>
    JSON.stringify({
      zarr_format: 3, node_type: "array", shape, data_type: dataType,
      chunk_grid: { name: "regular", configuration: { chunk_shape: shape } },
      chunk_key_encoding: { name: "default", configuration: { separator: "/" } },
      fill_value: 0, codecs: [{ name: "bytes", configuration: { endian: "little" } }],
      ...extra,
    });

  return memoryStore({
    [`${p}/obs/label_id/zarr.json`]: meta([nObs], "int64"),
    [`${p}/obs/label_id/c/0`]: i64(labelIds),
    [`${p}/var/_index/zarr.json`]: JSON.stringify({
      zarr_format: 3, node_type: "array", shape: [featureNames.length], data_type: "string",
      chunk_grid: { name: "regular", configuration: { chunk_shape: [featureNames.length] } },
      chunk_key_encoding: { name: "default", configuration: { separator: "/" } },
      fill_value: "", codecs: [{ name: "vlen-utf8" }],
    }),
    [`${p}/var/_index/c/0`]: vlenUtf8(featureNames),
    [`${p}/X/zarr.json`]: meta([nObs, featureNames.length], "float32"),
    [`${p}/X/c/0/0`]: f32(x.flat()),
  });
}

const LABEL_IDS = [7, 8, 9];
const FEATURES = ["timestep", "area"];
const X = [
  [0, 10],
  [1, 20],
  [1, 30],
];

describe("loadMeasurements — Zarr v2", () => {
  const build = v2Table;

  it("reads label ids, feature names and the feature matrix", async () => {
    const table = await loadMeasurements(build(LABEL_IDS, FEATURES, X));

    expect(table).not.toBeNull();
    expect(table!.labelIds).toEqual(LABEL_IDS);
    expect(Object.keys(table!.features).sort()).toEqual(["area", "timestep"]);
    expect(table!.features.area).toEqual([10, 20, 30]);
  });

  it("splits X by column, not by row", async () => {
    // The row/column stride is the easiest thing to get backwards, and getting it
    // backwards still produces a plausible-looking table.
    const table = await loadMeasurements(build(LABEL_IDS, FEATURES, X));
    expect(table!.features.timestep).toEqual([0, 1, 1]);
  });

  it("takes the frame from the timestep column and keys rows by (frame, label_id)", async () => {
    const table = await loadMeasurements(build(LABEL_IDS, FEATURES, X));

    expect(table!.frames).toEqual([0, 1, 1]);
    expect(table!.index.get(makeObjectKey(0, 7))).toBe(0);
    expect(table!.index.get(makeObjectKey(1, 8))).toBe(1);
    // Label 7 in frame 1 is a different object and is not in the table.
    expect(table!.index.get(makeObjectKey(1, 7))).toBeUndefined();
  });

  it("treats a table with no time column as single-frame", async () => {
    const table = await loadMeasurements(build(LABEL_IDS, ["area"], [[10], [20], [30]]));

    expect(table!.frames).toBeNull();
    expect(table!.index.get(makeObjectKey(0, 9))).toBe(2);
  });

  it("keeps the ids when X is missing, instead of failing the whole load", async () => {
    const p = "/tables/measurements";
    const full = build(LABEL_IDS, FEATURES, X) as unknown as { get: (k: string) => Promise<Uint8Array | undefined> };
    const withoutX: Readable = {
      get: async (key: string) => (key.startsWith(`${p}/X/`) ? undefined : full.get(key)),
    };

    const table = await loadMeasurements(withoutX);
    expect(table!.labelIds).toEqual(LABEL_IDS);
    expect(table!.features).toEqual({});
    expect(table!.frames).toBeNull();
  });
});

/**
 * Zarr v3 is a different metadata layout, not a different reader, so only the parts that
 * genuinely differ are re-tested here — plus one limitation that is worth pinning down.
 */
describe("loadMeasurements — Zarr v3", () => {
  it("reads the label ids from v3 metadata", async () => {
    const table = await loadMeasurements(v3Table(LABEL_IDS, FEATURES, X));

    expect(table).not.toBeNull();
    expect(table!.labelIds).toEqual(LABEL_IDS);
  });

  it("cannot yet read the feature names, because zarrita 0.5 rejects v3 string arrays", async () => {
    // AnnData stores `var/_index` as a string array. On Zarr v3 that means
    // `data_type: "string"`, which zarrita 0.5 refuses outright:
    //     Error: Unknown or unsupported data_type: string
    // `loadMeasurements` swallows the failure by design, so the table still loads with
    // its ids and simply exposes no features — the Features tab stays empty rather than
    // the whole scene failing.
    //
    // In practice nothing writes a v3 measurement table today: the ilastik path, which
    // produces the tables, writes v2. So this is a latent limit, not a live bug.
    //
    // ⚠️ When zarrita is upgraded (the 0.7.4 bump was opened as PR #60 and closed),
    // re-run this: if it starts passing feature names, delete this test and fold v3 back
    // into the shared suite above.
    const table = await loadMeasurements(v3Table(LABEL_IDS, FEATURES, X));

    expect(table!.features).toEqual({});
    expect(table!.frames).toBeNull();
  });

  it("still indexes rows, falling back to frame 0 without a time column", async () => {
    const table = await loadMeasurements(v3Table(LABEL_IDS, FEATURES, X));
    expect(table!.index.get(makeObjectKey(0, 8))).toBe(1);
  });
});

describe("loadMeasurements — absent table", () => {
  it("returns null when there is no label_id array, so callers can degrade", async () => {
    // A scene with no measurements is normal, not an error: the Features tab simply
    // does not appear.
    expect(await loadMeasurements(memoryStore({}))).toBeNull();
  });
});
