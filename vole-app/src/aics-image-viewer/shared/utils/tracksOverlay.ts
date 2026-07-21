import { Line3d, Spheres3d, type View3d, type Volume } from "@aics/vole-core";
import { Color } from "three";

import type { TrackingData } from "./loadTracks";

export type TracksOverlayOptions = {
  /** Flip the Y axis if tracks appear vertically mirrored relative to the image (default false). */
  flipY?: boolean;
  /** Flip the Z axis if tracks appear depth-mirrored (default false). */
  flipZ?: boolean;
  /** Trajectory line width, in screen pixels. */
  lineWidth?: number;
  /** Detection sphere radius, in normalized volume units (the volume spans 1.0). */
  detectionRadius?: number;
};

/**
 * Draws a tracking result over the volume: trajectories as a single {@link Line3d} with a time-synced "tail", plus the
 * per-frame detections as {@link Spheres3d} (the equivalent of napari's tracks + points layers).
 *
 * Both share one trick: the data is flattened and sorted by frame up front, so every time step is served by a binary
 * search into a contiguous slice instead of per-track bookkeeping.
 * - Trajectories: each consecutive pair of a track's points is a segment, sorted by the frame at which it *completes*.
 *   Segments whose end-frame is in `(t - tail, t]` are contiguous, so the tail is one `setVisibleSegmentsRange` call.
 * - Detections: all points sorted by frame, so the points of frame `t` are one contiguous slice.
 *
 * Positions are in the volume's normalized space (origin at center, extent -0.5..0.5 per axis), which is what
 * `View3d.addDrawableObject` expects; the volume's own transform then handles physical scaling.
 */
export class TracksOverlay {
  private readonly line: Line3d;
  private readonly spheres: Spheres3d;

  /** End-frame of each segment, ascending — parallel to the segment order uploaded to the line. */
  private readonly segmentEndFrames: Float64Array;
  /** Segment geometry and its untouched per-track colors, kept so selection can recolor without rebuilding. */
  private readonly segmentPositions: Float32Array;
  private readonly segmentBaseColors: Float32Array;
  private readonly segmentTrackIds: Int32Array;

  /** Detections, all sorted by frame ascending. */
  private readonly detFrames: Float64Array;
  private readonly detPositions: Float32Array;
  private readonly detScales: Float32Array;
  private readonly detIds: Uint32Array;
  private readonly detBaseColors: Float32Array;

  /**
   * Arrays actually rendered. They alias the full data when no track is selected, and are filtered copies holding only
   * the selected track when one is. Filtering (rather than dimming) is deliberate: with many tracks a dimmed-but-drawn
   * trajectory is still visual noise, so a selected track must be shown *alone*.
   */
  private activeSegPositions: Float32Array;
  private activeSegColors: Float32Array;
  private activeSegEndFrames: Float64Array;
  private activeDetPositions: Float32Array;
  private activeDetColors: Float32Array;
  private activeDetScales: Float32Array;
  private activeDetIds: Uint32Array;
  private activeDetFrames: Float64Array;

  private added = false;
  private selectedTrackId: number | null = null;
  /** Last values passed to {@link setTime}, so a selection change can re-apply them without moving the slider. */
  private lastFrame = 0;
  private lastTail = Infinity;

  constructor(tracking: TrackingData, volume: Volume, options?: TracksOverlayOptions) {
    const { x: sx, y: sy, z: sz } = volume.imageInfo.volumeSize;
    const flipY = options?.flipY ?? false;
    const flipZ = options?.flipZ ?? false;

    // Map an image-space voxel coordinate to the volume's normalized [-0.5, 0.5] space (voxel-centered).
    const nx = (x: number): number => (x + 0.5) / sx - 0.5;
    const ny = (y: number): number => (flipY ? sy - 1 - y : y + 0.5) / sy - 0.5;
    const nz = (z: number): number => (sz <= 1 ? 0 : (flipZ ? sz - 1 - z : z + 0.5) / sz - 0.5);

    type Segment = { endFrame: number; pos: number[]; col: number[]; trackId: number };
    type Detection = { frame: number; pos: [number, number, number]; col: [number, number, number]; trackId: number };
    const segments: Segment[] = [];
    const detections: Detection[] = [];

    tracking.tracks.forEach((track, trackIndex) => {
      const [r, g, b] = trackColor(trackIndex);
      const pts = track.points;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        detections.push({
          frame: p.t,
          pos: [nx(p.x), ny(p.y), nz(p.z)],
          col: [r, g, b],
          trackId: track.trackId,
        });
        if (i + 1 < pts.length) {
          const c = pts[i + 1];
          segments.push({
            endFrame: c.t,
            pos: [nx(p.x), ny(p.y), nz(p.z), nx(c.x), ny(c.y), nz(c.z)],
            col: [r, g, b, r, g, b],
            trackId: track.trackId,
          });
        }
      }
    });

    // --- Trajectories ---
    segments.sort((p, q) => p.endFrame - q.endFrame);
    this.segmentPositions = new Float32Array(segments.length * 6);
    this.segmentBaseColors = new Float32Array(segments.length * 6);
    this.segmentEndFrames = new Float64Array(segments.length);
    this.segmentTrackIds = new Int32Array(segments.length);
    segments.forEach((seg, i) => {
      this.segmentPositions.set(seg.pos, i * 6);
      this.segmentBaseColors.set(seg.col, i * 6);
      this.segmentEndFrames[i] = seg.endFrame;
      this.segmentTrackIds[i] = seg.trackId;
    });

    this.line = new Line3d();
    if (segments.length > 0) {
      this.line.setLineVertexData(this.segmentPositions, this.segmentBaseColors);
    }
    // White base multiplied by the per-vertex track colors. The cast bridges vole-app's and vole-core's separate
    // `@types/three` copies (same runtime class, duplicate type identities — see the known `Box3` note in useVolume).
    this.line.setColor(new Color(0xffffff) as unknown as Parameters<Line3d["setColor"]>[0], true);
    this.line.setLineWidth(options?.lineWidth ?? 2);
    this.line.setRenderAsOverlay(true); // always visible on top of the volume

    // --- Detections ---
    detections.sort((p, q) => p.frame - q.frame);
    const radius = options?.detectionRadius ?? 0.006;
    this.detFrames = new Float64Array(detections.length);
    this.detPositions = new Float32Array(detections.length * 3);
    this.detBaseColors = new Float32Array(detections.length * 3);
    this.detScales = new Float32Array(detections.length).fill(radius);
    this.detIds = new Uint32Array(detections.length);
    detections.forEach((det, i) => {
      this.detFrames[i] = det.frame;
      this.detPositions.set(det.pos, i * 3);
      this.detBaseColors.set(det.col, i * 3);
      // Passing ids enables the sphere pick material, so detections can later be clicked to drive selection.
      this.detIds[i] = det.trackId;
    });
    // No selection yet: render everything.
    this.activeSegPositions = this.segmentPositions;
    this.activeSegColors = this.segmentBaseColors;
    this.activeSegEndFrames = this.segmentEndFrames;
    this.activeDetPositions = this.detPositions;
    this.activeDetColors = this.detBaseColors;
    this.activeDetScales = this.detScales;
    this.activeDetIds = this.detIds;
    this.activeDetFrames = this.detFrames;

    this.spheres = new Spheres3d();
  }

  /** Add the overlay to a view. Safe to call more than once; use {@link dispose} to remove it. */
  addTo(view3d: View3d): void {
    if (!this.added) {
      view3d.addDrawableObject(this.line);
      view3d.addDrawableObject(this.spheres);
      this.added = true;
    }
  }

  /**
   * Show the trajectory tail ending at `currentFrame`, and the detections of that frame.
   *
   * `tailLength` is a number of frames; pass `Infinity` to draw the whole trajectory up to `currentFrame` (a growing
   * track rather than a fading tail).
   */
  setTime(currentFrame: number, tailLength: number): void {
    this.lastFrame = currentFrame;
    this.lastTail = tailLength;

    const end = countLessOrEqual(this.activeSegEndFrames, currentFrame);
    const start = Number.isFinite(tailLength)
      ? countLessOrEqual(this.activeSegEndFrames, currentFrame - tailLength)
      : 0;
    this.line.setVisibleSegmentsRange(start, end);

    // Detections of exactly this frame form the slice [lo, hi).
    const lo = countLess(this.activeDetFrames, currentFrame);
    const hi = countLessOrEqual(this.activeDetFrames, currentFrame);
    this.spheres.setSphereData(
      this.activeDetPositions.subarray(lo * 3, hi * 3),
      this.activeDetScales.subarray(lo, hi),
      this.activeDetIds.subarray(lo, hi)
    );
    if (hi > lo) {
      this.spheres.setColors(this.activeDetColors.subarray(lo * 3, hi * 3));
    }
  }

  /**
   * Show a single track *alone*, hiding every other trajectory and detection. Pass `null` to restore all tracks.
   * The non-selected geometry is filtered out rather than dimmed, so a crowded field becomes readable.
   */
  setSelectedTrack(trackId: number | null): void {
    if (trackId === this.selectedTrackId) {
      return;
    }
    this.selectedTrackId = trackId;

    if (trackId === null) {
      this.activeSegPositions = this.segmentPositions;
      this.activeSegColors = this.segmentBaseColors;
      this.activeSegEndFrames = this.segmentEndFrames;
      this.activeDetPositions = this.detPositions;
      this.activeDetColors = this.detBaseColors;
      this.activeDetScales = this.detScales;
      this.activeDetIds = this.detIds;
      this.activeDetFrames = this.detFrames;
    } else {
      const segIdx: number[] = [];
      for (let i = 0; i < this.segmentTrackIds.length; i++) {
        if (this.segmentTrackIds[i] === trackId) {
          segIdx.push(i);
        }
      }
      this.activeSegPositions = new Float32Array(segIdx.length * 6);
      this.activeSegColors = new Float32Array(segIdx.length * 6);
      this.activeSegEndFrames = new Float64Array(segIdx.length);
      segIdx.forEach((src, dst) => {
        this.activeSegPositions.set(this.segmentPositions.subarray(src * 6, src * 6 + 6), dst * 6);
        this.activeSegColors.set(this.segmentBaseColors.subarray(src * 6, src * 6 + 6), dst * 6);
        this.activeSegEndFrames[dst] = this.segmentEndFrames[src];
      });

      const detIdx: number[] = [];
      for (let i = 0; i < this.detIds.length; i++) {
        if (this.detIds[i] === trackId) {
          detIdx.push(i);
        }
      }
      this.activeDetPositions = new Float32Array(detIdx.length * 3);
      this.activeDetColors = new Float32Array(detIdx.length * 3);
      this.activeDetScales = new Float32Array(detIdx.length);
      this.activeDetIds = new Uint32Array(detIdx.length);
      this.activeDetFrames = new Float64Array(detIdx.length);
      detIdx.forEach((src, dst) => {
        this.activeDetPositions.set(this.detPositions.subarray(src * 3, src * 3 + 3), dst * 3);
        this.activeDetColors.set(this.detBaseColors.subarray(src * 3, src * 3 + 3), dst * 3);
        this.activeDetScales[dst] = this.detScales[src];
        this.activeDetIds[dst] = this.detIds[src];
        this.activeDetFrames[dst] = this.detFrames[src];
      });
    }

    if (this.activeSegPositions.length > 0) {
      this.line.setLineVertexData(this.activeSegPositions, this.activeSegColors);
    }
    // Re-apply the current frame so the change shows without touching the time slider.
    this.setTime(this.lastFrame, this.lastTail);
  }

  /** Trajectory line opacity in [0, 1]. */
  setOpacity(opacity: number): void {
    this.line.setOpacity(opacity);
  }

  /** Trajectory line width, in screen pixels. */
  setLineWidth(widthPx: number): void {
    this.line.setLineWidth(widthPx);
  }

  /** Show or hide the trajectory lines and the detection spheres independently. */
  setVisible(showTracks: boolean, showDetections: boolean): void {
    this.line.setVisible(showTracks);
    this.spheres.setVisible(showDetections);
  }

  /** Remove from the view and free GPU resources. */
  dispose(view3d: View3d): void {
    if (this.added) {
      view3d.removeDrawableObject(this.line);
      view3d.removeDrawableObject(this.spheres);
      this.added = false;
    }
    this.line.cleanup();
    this.spheres.cleanup();
  }
}

/** Number of entries `< value` in an ascending array (lower-bound index), via binary search. */
function countLess(sorted: Float64Array, value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

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
function trackColor(trackIndex: number): [number, number, number] {
  const hue = (trackIndex * 0.61803398875) % 1; // golden-angle hue spacing → well-separated colors
  const color = new Color();
  color.setHSL(hue, 0.75, 0.55);
  return [color.r, color.g, color.b];
}
