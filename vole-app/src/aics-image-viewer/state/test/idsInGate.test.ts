import { describe, expect, it } from "@jest/globals";

import { type Gate, idsInGate, type MeasurementTable } from "../selection";
import { makeObjectKey, type ObjectKey } from "../../shared/utils/objectKey";

/** Builds a table from column arrays, indexing rows the way `loadMeasurements` does. */
function table(labelIds: number[], frames: number[] | null, features: Record<string, number[]>): MeasurementTable {
  const index = new Map<ObjectKey, number>();
  labelIds.forEach((id, row) => index.set(makeObjectKey(frames ? frames[row] : 0, id), row));
  return { labelIds, frames, features, index };
}

const gate = (xRange: [number, number], yRange: [number, number]): Gate => ({
  id: "g",
  name: "gate",
  color: "#f00",
  xFeature: "area",
  xRange,
  yFeature: "mean",
  yRange,
});

describe("idsInGate", () => {
  const single = table([1, 2, 3], null, { area: [10, 20, 30], mean: [5, 5, 5] });

  it("keeps objects inside both ranges", () => {
    const inside = idsInGate(single, gate([15, 25], [0, 10]));
    expect([...inside]).toEqual([makeObjectKey(0, 2)]);
  });

  it("requires BOTH features to be in range, not either", () => {
    // area 10 is in range, mean 5 is not: the object must be excluded.
    expect(idsInGate(single, gate([0, 15], [100, 200])).size).toBe(0);
  });

  it("includes the bounds — the range is closed on both ends", () => {
    const inside = idsInGate(single, gate([10, 30], [5, 5]));
    expect(inside.size).toBe(3);
  });

  it("returns an empty set for an empty range rather than throwing", () => {
    expect(idsInGate(single, gate([25, 15], [0, 10])).size).toBe(0);
  });

  it("keys by (frame, label_id), so the same label in two frames is two objects", () => {
    // The A3 invariant, at the gating level: label 7 exists in frames 0 and 1.
    const movie = table([7, 7], [0, 1], { area: [10, 10], mean: [1, 1] });
    const inside = idsInGate(movie, gate([0, 100], [0, 100]));

    expect(inside.size).toBe(2);
    expect(inside.has(makeObjectKey(0, 7))).toBe(true);
    expect(inside.has(makeObjectKey(1, 7))).toBe(true);
  });

  it("falls back to frame 0 when the table has no time column", () => {
    const inside = idsInGate(single, gate([0, 100], [0, 100]));
    expect([...inside].every((key) => key === makeObjectKey(0, [1, 2, 3][[...inside].indexOf(key)]))).toBe(true);
  });

  it("returns empty when there is no table at all", () => {
    expect(idsInGate(null, gate([0, 100], [0, 100])).size).toBe(0);
  });

  it("returns empty when a gated feature is missing, instead of gating on undefined", () => {
    // A gate saved against a column that a later scene does not have: comparisons
    // with undefined are all false, so silently gating nothing would look the same
    // as gating everything out. The guard makes the miss explicit.
    const other = table([1], null, { area: [10] });
    expect(idsInGate(other, gate([0, 100], [0, 100])).size).toBe(0);
  });

  it("excludes NaN, which no comparison admits", () => {
    const withNan = table([1, 2], null, { area: [NaN, 20], mean: [5, 5] });
    const inside = idsInGate(withNan, gate([0, 100], [0, 100]));
    expect([...inside]).toEqual([makeObjectKey(0, 2)]);
  });
});
