import { describe, expect, it } from "@jest/globals";

import type { Track } from "../loadTracks";
import { computeTrackStats } from "../trackStats";

const track = (trackId: number, points: [number, number, number, number][]): Track => ({
  trackId,
  points: points.map(([t, x, y, z]) => ({ t, x, y, z })),
});

describe("computeTrackStats", () => {
  it("measures a straight, evenly-spaced 2D track", () => {
    // (0,0) -> (3,0) -> (6,0) over frames 0..2: 3 voxels per step.
    const stats = computeTrackStats(
      track(7, [
        [0, 0, 0, 0],
        [1, 3, 0, 0],
        [2, 6, 0, 0],
      ])
    );

    expect(stats.trackId).toBe(7);
    expect(stats.startFrame).toBe(0);
    expect(stats.endFrame).toBe(2);
    expect(stats.duration).toBe(3); // inclusive span
    expect(stats.pointCount).toBe(3);
    expect(stats.pathLength).toBeCloseTo(6);
    expect(stats.netDisplacement).toBeCloseTo(6);
    expect(stats.meanSpeed).toBeCloseTo(3); // 6 voxels over 2 frame intervals
    expect(stats.maxStep).toBeCloseTo(3);
    expect(stats.straightness).toBeCloseTo(1); // perfectly straight
  });

  it("flags a suspicious jump via maxStep and a low straightness", () => {
    // Small steps, then one big jump away and back — the classic identity-swap shape.
    const stats = computeTrackStats(
      track(1, [
        [0, 0, 0, 0],
        [1, 1, 0, 0],
        [2, 100, 0, 0],
        [3, 2, 0, 0],
      ])
    );

    expect(stats.maxStep).toBeCloseTo(99); // the jump dominates
    expect(stats.pathLength).toBeCloseTo(1 + 99 + 98);
    expect(stats.netDisplacement).toBeCloseTo(2);
    expect(stats.straightness).toBeLessThan(0.02); // wandered far, ended up nowhere
  });

  it("accounts for 3D displacement", () => {
    // 3-4-5 triangle in x/z.
    const stats = computeTrackStats(
      track(2, [
        [0, 0, 0, 0],
        [1, 3, 0, 4],
      ])
    );
    expect(stats.pathLength).toBeCloseTo(5);
    expect(stats.netDisplacement).toBeCloseTo(5);
    expect(stats.meanSpeed).toBeCloseTo(5);
  });

  it("reports gaps: pointCount is smaller than the frame span", () => {
    const stats = computeTrackStats(
      track(3, [
        [0, 0, 0, 0],
        [5, 1, 0, 0],
      ])
    );
    expect(stats.duration).toBe(6); // frames 0..5 inclusive
    expect(stats.pointCount).toBe(2); // but only two detections
    expect(stats.meanSpeed).toBeCloseTo(1 / 5);
  });

  it("returns zeroed metrics for a single-point track instead of NaN", () => {
    const stats = computeTrackStats(track(4, [[9, 5, 5, 5]]));
    expect(stats.duration).toBe(1);
    expect(stats.pathLength).toBe(0);
    expect(stats.netDisplacement).toBe(0);
    expect(stats.meanSpeed).toBe(0);
    expect(stats.maxStep).toBe(0);
    expect(stats.straightness).toBe(0);
    expect(Number.isNaN(stats.meanSpeed)).toBe(false);
  });
});
