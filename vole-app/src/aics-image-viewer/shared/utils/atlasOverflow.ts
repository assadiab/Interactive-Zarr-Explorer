import type { Volume } from "@aics/vole-core";

/**
 * What the loader reports when even the coarsest multiscale level overflows the atlas budget.
 *
 * Mirrors the engine's `AtlasOverflow`, declared here rather than imported because it travels as
 * opaque `userData` — the same arrangement as {@link getLabelChannels}, and it keeps the app from
 * depending on a type the engine does not export.
 */
export type AtlasOverflow = {
  /** Level actually loaded — the coarsest available. */
  level: number;
  levelCount: number;
  shapeZYX: [number, number, number];
  maxAtlasEdge: number;
  /** Undefined when only the texture edge limit applied, with no memory budget. */
  maxAtlasBytes?: number;
};

/**
 * The overflow report for `volume`, or null when every level fit.
 *
 * The load still succeeds when this is set: the volume is simply coarser than requested, or past
 * the texture edge, wrong. The engine only writes a `console.error`, which no user opens — this is
 * what lets the app say it out loud instead.
 */
export function getAtlasOverflow(volume: Volume): AtlasOverflow | null {
  const raw = volume.imageInfo.imageInfo.userData?.atlasOverflow;
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const overflow = raw as AtlasOverflow;
  if (
    !Number.isInteger(overflow.level) ||
    !Number.isInteger(overflow.levelCount) ||
    !Array.isArray(overflow.shapeZYX) ||
    overflow.shapeZYX.length !== 3
  ) {
    return null;
  }
  return overflow;
}

/** Human-readable byte size, for the warning text. */
function formatBytes(bytes: number): string {
  const gib = bytes / 1024 ** 3;
  return gib >= 1 ? `${gib.toFixed(gib >= 10 ? 0 : 1)} GiB` : `${Math.round(bytes / 1024 ** 2)} MiB`;
}

/** Title and body for the alert shown when a volume did not fit. */
export function describeAtlasOverflow(overflow: AtlasOverflow): { title: string; description: string } {
  const [z, y, x] = overflow.shapeZYX;
  const budget = overflow.maxAtlasBytes !== undefined ? ` and the ${formatBytes(overflow.maxAtlasBytes)} memory budget` : "";
  const levels = overflow.levelCount === 1 ? "the only level available" : `the coarsest of ${overflow.levelCount} levels`;

  return {
    title: "Volume too large — showing it at reduced quality",
    description:
      `Even ${levels} (${x}×${y}×${z} voxels) exceeds the ${overflow.maxAtlasEdge}px texture limit${budget}, ` +
      `so it was loaded anyway and may render incorrectly. Add a coarser multiscale level when packaging the data, ` +
      `or raise the viewer's memory budget if the GPU has room.`,
  };
}
