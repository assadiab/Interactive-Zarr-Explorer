import { Line3d, type View3d, type Volume } from "@aics/vole-core";
import { Color } from "three";

import type { TrackingData } from "./loadTracks";

/**
 * Draws tracking trajectories as a single {@link Line3d} overlaid on the volume, with a time-synced "tail".
 *
 * All tracks share one line object (one draw call): every consecutive pair of a track's points becomes a segment, and
 * the segments are sorted by the frame at which they *complete*. Because that order is monotonic in time, the segments
 * whose end-frame falls in `(t - tail, t]` form a contiguous slice — so a moving tail is just a
 * `setVisibleSegmentsRange(start, end)` call, computed by binary search, no per-track bookkeeping.
 *
 * Positions are in the volume's normalized space (origin at center, extent -0.5..0.5 per axis), which is what
 * `View3d.addDrawableObject` expects; the volume's own transform then handles physical scaling.
 */
export class TracksOverlay {
  private readonly line: Line3d;
  /** End-frame of each segment, ascending — parallel to the segment order uploaded to the line. */
  private readonly segmentEndFrames: Float64Array;
  private added = false;

  constructor(tracking: TrackingData, volume: Volume, options?: TracksOverlayOptions) {
    const { x: sx, y: sy, z: sz } = volume.imageInfo.volumeSize;
    const flipY = options?.flipY ?? false;
    const flipZ = options?.flipZ ?? false;

    // Map an image-space voxel coordinate to the volume's normalized [-0.5, 0.5] space (voxel-centered).
    const nx = (x: number): number => (x + 0.5) / sx - 0.5;
    const ny = (y: number): number => (flipY ? sy - 1 - y : y + 0.5) / sy - 0.5;
    const nz = (z: number): number => (sz <= 1 ? 0 : (flipZ ? sz - 1 - z : z + 0.5) / sz - 0.5);

    // Build one record per segment so we can sort them together, then flatten.
    type Segment = { endFrame: number; pos: number[]; col: number[] };
    const segments: Segment[] = [];
    tracking.tracks.forEach((track, trackIndex) => {
      const [r, g, b] = trackColor(trackIndex, tracking.tracks.length);
      const pts = track.points;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const c = pts[i + 1];
        segments.push({
          endFrame: c.t,
          pos: [nx(a.x), ny(a.y), nz(a.z), nx(c.x), ny(c.y), nz(c.z)],
          col: [r, g, b, r, g, b],
        });
      }
    });
    segments.sort((p, q) => p.endFrame - q.endFrame);

    const positions = new Float32Array(segments.length * 6);
    const colors = new Float32Array(segments.length * 6);
    this.segmentEndFrames = new Float64Array(segments.length);
    segments.forEach((seg, i) => {
      positions.set(seg.pos, i * 6);
      colors.set(seg.col, i * 6);
      this.segmentEndFrames[i] = seg.endFrame;
    });

    this.line = new Line3d();
    if (segments.length > 0) {
      this.line.setLineVertexData(positions, colors);
    }
    // White base multiplied by the per-vertex track colors. The cast bridges vole-app's and vole-core's separate
    // `@types/three` copies (same runtime class, duplicate type identities — see the known `Box3` note in useVolume).
    this.line.setColor(new Color(0xffffff) as unknown as Parameters<Line3d["setColor"]>[0], true);
    this.line.setLineWidth(options?.lineWidth ?? 2);
    this.line.setRenderAsOverlay(true); // always visible on top of the volume
  }

  /** Add the overlay to a view. Safe to call once; use {@link dispose} to remove it. */
  addTo(view3d: View3d): void {
    if (!this.added) {
      view3d.addDrawableObject(this.line);
      this.added = true;
    }
  }

  /**
   * Show only the tail ending at `currentFrame`. `tailLength` is a number of frames; pass `Infinity` to show the whole
   * trajectory up to `currentFrame` (a growing track with no fade-out of old segments).
   */
  setTime(currentFrame: number, tailLength: number): void {
    const end = countLessOrEqual(this.segmentEndFrames, currentFrame);
    const start = Number.isFinite(tailLength)
      ? countLessOrEqual(this.segmentEndFrames, currentFrame - tailLength)
      : 0;
    this.line.setVisibleSegmentsRange(start, end);
  }

  /** Remove from the view and free GPU resources. */
  dispose(view3d: View3d): void {
    if (this.added) {
      view3d.removeDrawableObject(this.line);
      this.added = false;
    }
    this.line.cleanup();
  }
}

export type TracksOverlayOptions = {
  /** Flip the Y axis if tracks appear vertically mirrored relative to the image (default false). */
  flipY?: boolean;
  /** Flip the Z axis if tracks appear depth-mirrored (default false). */
  flipZ?: boolean;
  lineWidth?: number;
};

/** Number of entries `<= value` in an ascending array (upper-bound index), via binary search. */
function countLessOrEqual(sorted: Float64Array, value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** A distinct, deterministic RGB color (0..1) per track, spread around the hue wheel by the golden angle. */
function trackColor(trackIndex: number, _trackCount: number): [number, number, number] {
  const hue = (trackIndex * 0.61803398875) % 1; // golden-angle hue spacing → well-separated colors
  const color = new Color();
  color.setHSL(hue, 0.75, 0.55);
  return [color.r, color.g, color.b];
}
