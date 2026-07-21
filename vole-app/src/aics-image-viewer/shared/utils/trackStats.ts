import type { Track } from "./loadTracks";

/**
 * Summary of a single trajectory, derived from the centroids alone.
 *
 * ⚠️ All distances/speeds are in **voxels** (and voxels per frame), because that is the only unit the tracking CSV
 * gives us. They become physical (µm, µm/min) once the viewer reads `coordinateTransformations.scale` and the time
 * axis unit — see task R3. Note also that a voxel-space distance mixes anisotropic Z with XY, so treat Z-heavy
 * comparisons with care until R3 lands.
 */
export interface TrackStats {
  trackId: number;
  startFrame: number;
  endFrame: number;
  /** Inclusive frame span, i.e. `endFrame - startFrame + 1`. */
  duration: number;
  /** Detections actually present; smaller than `duration` when the track has gaps. */
  pointCount: number;
  /** Sum of all step lengths, in voxels. */
  pathLength: number;
  /** Straight-line distance from the first to the last detection, in voxels. */
  netDisplacement: number;
  /** `pathLength` divided by the number of frame intervals, in voxels per frame. */
  meanSpeed: number;
  /**
   * Largest single step, in voxels. A spike relative to the typical step is the most direct signal of a suspicious
   * jump (identity swap, missed detection) — the "why does this cell jump here?" question.
   */
  maxStep: number;
  /**
   * `netDisplacement / pathLength`, in [0, 1]. 1 means a perfectly straight path; values near 0 mean the object
   * wandered (or the track zig-zags between wrong objects).
   */
  straightness: number;
}

/** Euclidean distance between two points, in voxel space. */
function distance(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Compute {@link TrackStats} for one track. Points are expected sorted by time (as produced by `parseTracksCsv`).
 * A track with a single point yields zero-length metrics rather than NaN.
 */
export function computeTrackStats(track: Track): TrackStats {
  const pts = track.points;
  const first = pts[0];
  const last = pts[pts.length - 1];

  let pathLength = 0;
  let maxStep = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const step = distance(a.x, a.y, a.z, b.x, b.y, b.z);
    pathLength += step;
    maxStep = Math.max(maxStep, step);
  }

  const netDisplacement = distance(first.x, first.y, first.z, last.x, last.y, last.z);
  const frameIntervals = last.t - first.t;

  return {
    trackId: track.trackId,
    startFrame: first.t,
    endFrame: last.t,
    duration: last.t - first.t + 1,
    pointCount: pts.length,
    pathLength,
    netDisplacement,
    meanSpeed: frameIntervals > 0 ? pathLength / frameIntervals : 0,
    maxStep,
    straightness: pathLength > 0 ? netDisplacement / pathLength : 0,
  };
}
