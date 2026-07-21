import { describe, expect, it } from "@jest/globals";

import {
  labelIdsInFrame,
  makeObjectKey,
  MAX_FRAME,
  MAX_LABEL_ID,
  objectKeyFrame,
  objectKeyLabelId,
} from "../objectKey";

describe("objectKey", () => {
  it("round-trips a (frame, labelId) pair", () => {
    const key = makeObjectKey(37, 4821);
    expect(objectKeyFrame(key)).toBe(37);
    expect(objectKeyLabelId(key)).toBe(4821);
  });

  it("keeps the same label id in different frames distinct", () => {
    // The whole point of A3: label 7 is a different object in each frame.
    expect(makeObjectKey(0, 7)).not.toBe(makeObjectKey(1, 7));
    expect(objectKeyLabelId(makeObjectKey(0, 7))).toBe(objectKeyLabelId(makeObjectKey(1, 7)));
  });

  it("handles frame 0 and label 0 (background) without collapsing", () => {
    const zero = makeObjectKey(0, 0);
    expect(zero).toBe(0);
    expect(objectKeyFrame(zero)).toBe(0);
    expect(objectKeyLabelId(zero)).toBe(0);
  });

  it("stays exact at the top of the supported range", () => {
    const key = makeObjectKey(MAX_FRAME, MAX_LABEL_ID);
    expect(Number.isSafeInteger(key)).toBe(true);
    expect(objectKeyFrame(key)).toBe(MAX_FRAME);
    expect(objectKeyLabelId(key)).toBe(MAX_LABEL_ID);
  });

  it("clamps out-of-range input instead of wrapping into another object's key", () => {
    // Wrapping would silently alias two distinct objects; clamping keeps it detectable.
    expect(objectKeyLabelId(makeObjectKey(0, MAX_LABEL_ID + 10))).toBe(MAX_LABEL_ID);
    expect(objectKeyFrame(makeObjectKey(-5, 3))).toBe(0);
    expect(objectKeyLabelId(makeObjectKey(0, -1))).toBe(0);
  });

  it("truncates non-integer input", () => {
    expect(objectKeyFrame(makeObjectKey(2.9, 5.7))).toBe(2);
    expect(objectKeyLabelId(makeObjectKey(2.9, 5.7))).toBe(5);
  });

  it("extracts the label ids of one frame only", () => {
    const keys = [makeObjectKey(0, 1), makeObjectKey(0, 2), makeObjectKey(1, 1), makeObjectKey(2, 9)];
    expect(labelIdsInFrame(keys, 0)).toEqual(new Set([1, 2]));
    expect(labelIdsInFrame(keys, 1)).toEqual(new Set([1]));
    expect(labelIdsInFrame(keys, 3)).toEqual(new Set());
  });
});
