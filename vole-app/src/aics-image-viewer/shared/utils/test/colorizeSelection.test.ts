import { describe, expect, it } from "@jest/globals";

import { packSelectionLookups } from "../colorizeSelection";
import { makeObjectKey } from "../objectKey";

/** Reads the global id the lookup maps `labelId` to, undoing the shader's +1 offset. */
function globalIdOf(segIdToGlobalId: Uint32Array, labelId: number): number {
  return segIdToGlobalId[labelId] - 1;
}

describe("packSelectionLookups", () => {
  it("groups the selection by frame", () => {
    const { frames, objectCount } = packSelectionLookups([
      makeObjectKey(0, 3),
      makeObjectKey(4, 3),
      makeObjectKey(4, 9),
    ]);

    expect([...frames.keys()].sort((a, b) => a - b)).toEqual([0, 4]);
    expect(objectCount).toBe(3);
    // Label 3 exists in both frames and is a different object in each — invariant A3.
    expect(globalIdOf(frames.get(0)!.segIdToGlobalId, 3)).not.toBe(globalIdOf(frames.get(4)!.segIdToGlobalId, 3));
  });

  it("indexes from zero rather than from the lowest selected id", () => {
    // A lookup offset to the selection's own range leaves lower ids out of the texture, where
    // `texelFetch` folds them back onto a selected entry and every object lights up.
    const { frames } = packSelectionLookups([makeObjectKey(0, 900), makeObjectKey(0, 910)]);
    const { minSegId, segIdToGlobalId } = frames.get(0)!;

    expect(minSegId).toBe(0);
    expect(segIdToGlobalId[900]).not.toBe(0);
    expect(segIdToGlobalId[910]).not.toBe(0);
  });

  it("spans every label id up to the ceiling, plus a zero entry past it", () => {
    const { frames } = packSelectionLookups([makeObjectKey(0, 5)], 377);
    const { segIdToGlobalId } = frames.get(0)!;

    expect(segIdToGlobalId.length).toBeGreaterThan(377);
    // Unselected ids inside the range must resolve to "no object", so they are not painted.
    expect(segIdToGlobalId[377]).toBe(0);
    expect(segIdToGlobalId[segIdToGlobalId.length - 1]).toBe(0);
  });

  it("still covers the selection when no ceiling is given", () => {
    const { frames } = packSelectionLookups([makeObjectKey(0, 42)]);
    const { segIdToGlobalId } = frames.get(0)!;

    expect(segIdToGlobalId[42]).not.toBe(0);
    expect(segIdToGlobalId.length).toBeGreaterThan(42);
  });

  it("assigns global ids in (frame, label id) order, whatever the click order", () => {
    const clicked = packSelectionLookups([makeObjectKey(4, 9), makeObjectKey(0, 3), makeObjectKey(4, 3)]);
    const sorted = packSelectionLookups([makeObjectKey(0, 3), makeObjectKey(4, 3), makeObjectKey(4, 9)]);

    for (const frame of [0, 4]) {
      expect([...clicked.frames.get(frame)!.segIdToGlobalId]).toEqual([...sorted.frames.get(frame)!.segIdToGlobalId]);
    }
  });

  it("gives every selected object a distinct global id, numbered from zero", () => {
    const { frames, objectCount } = packSelectionLookups([
      makeObjectKey(0, 3),
      makeObjectKey(0, 8),
      makeObjectKey(2, 1),
    ]);

    const globalIds = [
      globalIdOf(frames.get(0)!.segIdToGlobalId, 3),
      globalIdOf(frames.get(0)!.segIdToGlobalId, 8),
      globalIdOf(frames.get(2)!.segIdToGlobalId, 1),
    ].sort((a, b) => a - b);

    // The shader indexes the feature buffers with these, so they must be exactly 0..count-1.
    expect(globalIds).toEqual([0, 1, 2]);
    expect(objectCount).toBe(3);
  });

  it("reports nothing selected for an empty selection", () => {
    const { frames, objectCount } = packSelectionLookups([]);
    expect(objectCount).toBe(0);
    expect(frames.size).toBe(0);
  });
});
