import { describe, expect, it } from "@jest/globals";

import { type AtlasOverflow, describeAtlasOverflow, getAtlasOverflow } from "../atlasOverflow";

/** Minimal stand-in for the parts of `Volume` the reader touches. */
const volumeWith = (userData: unknown): Parameters<typeof getAtlasOverflow>[0] =>
  ({ imageInfo: { imageInfo: { userData } } }) as unknown as Parameters<typeof getAtlasOverflow>[0];

const OVERFLOW: AtlasOverflow = {
  level: 2,
  levelCount: 3,
  shapeZYX: [64, 8192, 8192],
  maxAtlasEdge: 4096,
  maxAtlasBytes: 1024 ** 3,
};

describe("getAtlasOverflow", () => {
  it("reads the report the loader attached", () => {
    expect(getAtlasOverflow(volumeWith({ atlasOverflow: OVERFLOW }))).toEqual(OVERFLOW);
  });

  it("returns null when every level fit", () => {
    expect(getAtlasOverflow(volumeWith(undefined))).toBeNull();
    expect(getAtlasOverflow(volumeWith({}))).toBeNull();
    expect(getAtlasOverflow(volumeWith({ labelChannels: [] }))).toBeNull();
  });

  it("rejects a malformed report rather than surfacing a broken warning", () => {
    expect(getAtlasOverflow(volumeWith({ atlasOverflow: { level: "2" } }))).toBeNull();
    expect(getAtlasOverflow(volumeWith({ atlasOverflow: { ...OVERFLOW, shapeZYX: [1, 2] } }))).toBeNull();
    expect(getAtlasOverflow(volumeWith({ atlasOverflow: null }))).toBeNull();
  });
});

describe("describeAtlasOverflow", () => {
  it("names the dimensions in XYZ order and both limits", () => {
    const { title, description } = describeAtlasOverflow(OVERFLOW);
    expect(title).toContain("too large");
    expect(description).toContain("8192×8192×64");
    expect(description).toContain("4096px");
    expect(description).toContain("1.0 GiB");
  });

  it("omits the budget from the limit clause when only the edge limit applied", () => {
    const { description } = describeAtlasOverflow({ ...OVERFLOW, maxAtlasBytes: undefined });
    // The closing advice always mentions the budget; what must disappear is the clause naming it
    // as a limit that was actually exceeded.
    expect(description).not.toContain("and the");
    expect(description).toContain("4096px texture limit,");
  });

  it("does not say 'coarsest of 1 levels' when there is a single level", () => {
    const { description } = describeAtlasOverflow({ ...OVERFLOW, levelCount: 1 });
    expect(description).toContain("the only level available");
  });
});
