import { describe, expect, it } from "vitest";

import { atlasBytes, bytesPerSample, estimateLevelForAtlas, MAX_ATLAS_EDGE } from "../loaders/VolumeLoaderUtils.js";

type ZYX = [number, number, number];

/** A pyramid halving X and Y at each level, like a real multiscale image. */
const pyramid = (z: number, y: number, x: number, levels: number): ZYX[] =>
  Array.from({ length: levels }, (_, i) => [z, Math.ceil(y / 2 ** i), Math.ceil(x / 2 ** i)] as ZYX);

const LEVELS = pyramid(64, 2048, 2048, 8);

describe("bytesPerSample", () => {
  it("sizes each channel sample by its type", () => {
    expect(bytesPerSample("uint8")).toBe(1);
    expect(bytesPerSample("int8")).toBe(1);
    expect(bytesPerSample("uint16")).toBe(2);
    expect(bytesPerSample("int16")).toBe(2);
    expect(bytesPerSample("float32")).toBe(4);
    expect(bytesPerSample("uint32")).toBe(4);
  });
});

describe("atlasBytes", () => {
  it("scales with the cost of a voxel across every channel", () => {
    const dims: ZYX = [64, 512, 512];
    expect(atlasBytes(dims, 2)).toBe(atlasBytes(dims, 1) * 2);
  });

  it("shrinks as the level gets coarser", () => {
    expect(atlasBytes([64, 256, 256], 1)).toBeLessThan(atlasBytes([64, 512, 512], 1));
  });
});

describe("estimateLevelForAtlas", () => {
  const edgeOnly = estimateLevelForAtlas(LEVELS, MAX_ATLAS_EDGE)!;

  it("picks a level from the atlas edge alone when no budget is given", () => {
    expect(edgeOnly).toBeGreaterThanOrEqual(0);
    expect(edgeOnly).toBeLessThan(LEVELS.length);
  });

  it("keeps that answer when the budget is generous", () => {
    const generous = { maxBytes: atlasBytes(LEVELS[edgeOnly], 1) * 100, bytesPerVoxel: 1 };
    expect(estimateLevelForAtlas(LEVELS, MAX_ATLAS_EDGE, generous)).toBe(edgeOnly);
  });

  // The regression this change exists for: the edge test reasons about ONE channel, so
  // overlaying sources multiplies the real cost while its answer stays put.
  it("drops to a coarser level when more channels no longer fit the same budget", () => {
    // Budget = exactly what the edge-picked level costs for a single uint8 channel.
    const maxBytes = atlasBytes(LEVELS[edgeOnly], 1);
    expect(estimateLevelForAtlas(LEVELS, MAX_ATLAS_EDGE, { maxBytes, bytesPerVoxel: 1 })).toBe(edgeOnly);
    expect(estimateLevelForAtlas(LEVELS, MAX_ATLAS_EDGE, { maxBytes, bytesPerVoxel: 2 })!).toBeGreaterThan(edgeOnly);
  });

  it("never returns a finer level as the per-voxel cost grows", () => {
    const maxBytes = atlasBytes(LEVELS[edgeOnly], 1);
    let previous = -1;
    for (const bytesPerVoxel of [1, 2, 4, 8, 16, 32]) {
      const level = estimateLevelForAtlas(LEVELS, MAX_ATLAS_EDGE, { maxBytes, bytesPerVoxel });
      if (level === undefined) {
        break; // nothing fits any more; monotonic up to here
      }
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
    expect(previous).toBeGreaterThan(edgeOnly);
  });

  it("reports no level at all when even the coarsest blows the budget", () => {
    expect(estimateLevelForAtlas(LEVELS, MAX_ATLAS_EDGE, { maxBytes: 1, bytesPerVoxel: 1 })).toBeUndefined();
  });

  it("still returns level 0 for a single-level image, budget or not", () => {
    expect(estimateLevelForAtlas([[64, 2048, 2048]], MAX_ATLAS_EDGE, { maxBytes: 1, bytesPerVoxel: 1 })).toBe(0);
  });
});
