import { Color, DataTexture, FloatType, RedFormat, RedIntegerFormat, RGBAFormat, UnsignedByteType, UnsignedIntType } from "three";

import { objectKeyFrame, objectKeyLabelId, type ObjectKey } from "./objectKey";

/**
 * Builds what the engine needs to paint the selected objects in the 3D view.
 *
 * `View3d.setChannelColorizeFeature` takes a full `ColorizeFeature` — the machinery the
 * upstream colorizer uses to map a feature value onto every object, through two data
 * textures and a per-frame lookup. Highlighting a selection needs far less than that: an
 * object is either picked or it is not. So this builds the smallest structure that says so,
 * and leaves the rest at inert defaults.
 *
 * The one non-obvious part is `frameToGlobalIdLookup`. The shader reads a raw pixel value
 * (the segmentation label id) and has to turn it into an index into the feature textures,
 * per frame — label ids are numbered per timepoint, so the same id in two frames is two
 * different objects. The lookup is a texture indexed by `segId - minSegId`, holding
 * `globalId + 1` (0 meaning "no object here"). Storing `minSegId` rather than indexing from
 * zero is what keeps it small: a frame whose ids run 900–910 costs eleven entries, not 911.
 */

/** Only the selected objects get an entry, so anything else falls through to normal rendering. */
export type SelectionColorize = {
  idsToFeatureValue: DataTexture;
  featureValueToColor: DataTexture;
  useRepeatingColor: boolean;
  frameToGlobalIdLookup: Map<number, { texture: DataTexture; minSegId: number }>;
  inRangeIds: DataTexture;
  outlierData: DataTexture;
  featureMin: number;
  featureMax: number;
  outlineColor: Color;
  outlinePalette: DataTexture;
  useOutlinePalette: boolean;
  innerOutlineColor: Color;
  innerOutlineThickness: number;
  outlineAlpha: number;
  outlierColor: Color;
  outOfRangeColor: Color;
  outlierDrawMode: number;
  outOfRangeDrawMode: number;
  hideOutOfRange: boolean;
};

/**
 * The per-frame lookup arrays, before they become textures.
 *
 * Split out from the texture building so the packing — the part that can actually be wrong —
 * is testable without a WebGL context.
 */
// `Uint32Array` alone widens to `Uint32Array<ArrayBufferLike>` under TS 5.7+, which a
// `DataTexture` refuses — it needs a plain `ArrayBuffer`, which is what `new Uint32Array(n)`
// actually allocates.
export type FrameLookup = { minSegId: number; segIdToGlobalId: Uint32Array<ArrayBuffer> };

/**
 * Groups selected keys by frame and packs each frame's label ids into a lookup array.
 *
 * Every selected object gets a global id, assigned in ascending (frame, label id) order so
 * the result does not depend on the order the user happened to click in.
 */
export function packSelectionLookups(selected: Iterable<ObjectKey>): {
  frames: Map<number, FrameLookup>;
  objectCount: number;
} {
  const byFrame = new Map<number, number[]>();
  for (const key of selected) {
    const frame = objectKeyFrame(key);
    const labelId = objectKeyLabelId(key);
    const ids = byFrame.get(frame);
    if (ids === undefined) {
      byFrame.set(frame, [labelId]);
    } else {
      ids.push(labelId);
    }
  }

  const frames = new Map<number, FrameLookup>();
  let nextGlobalId = 0;
  for (const frame of [...byFrame.keys()].sort((a, b) => a - b)) {
    const labelIds = byFrame.get(frame)!.sort((a, b) => a - b);
    const minSegId = labelIds[0];
    const span = labelIds[labelIds.length - 1] - minSegId + 1;
    const segIdToGlobalId = new Uint32Array(span);
    for (const labelId of labelIds) {
      // +1 because 0 means "no object mapped here".
      segIdToGlobalId[labelId - minSegId] = nextGlobalId + 1;
      nextGlobalId += 1;
    }
    frames.set(frame, { minSegId, segIdToGlobalId });
  }

  return { frames, objectCount: nextGlobalId };
}

/** A 1×1 texture, for the inputs a selection highlight has no use for. */
function inertTexture(): DataTexture {
  const texture = new DataTexture(new Uint8Array([0]), 1, 1, RedIntegerFormat, UnsignedByteType);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Turns the current selection into a colorize feature that paints picked objects in
 * `highlight`, or `null` when nothing is selected — which is what the caller should hand
 * back to the engine to clear the highlight.
 */
export function buildSelectionColorize(selected: Iterable<ObjectKey>, highlight: Color): SelectionColorize | null {
  const { frames, objectCount } = packSelectionLookups(selected);
  if (objectCount === 0) {
    return null;
  }

  const frameToGlobalIdLookup = new Map<number, { texture: DataTexture; minSegId: number }>();
  for (const [frame, { minSegId, segIdToGlobalId }] of frames) {
    const texture = new DataTexture(
      segIdToGlobalId,
      segIdToGlobalId.length,
      1,
      RedIntegerFormat,
      UnsignedIntType
    );
    texture.needsUpdate = true;
    frameToGlobalIdLookup.set(frame, { texture, minSegId });
  }

  // Every selected object carries the same value, so the ramp only has to hold one color.
  const idsToFeatureValue = new DataTexture(new Float32Array(objectCount).fill(1), objectCount, 1, RedFormat, FloatType);
  idsToFeatureValue.needsUpdate = true;

  // `useRepeatingColor` makes the ramp a direct lookup on the value rather than an
  // interpolation between min and max, so index 1 is the color a selected object gets.
  const rgb = new Uint8Array([0, 0, 0, 255, highlight.r * 255, highlight.g * 255, highlight.b * 255, 255]);
  const featureValueToColor = new DataTexture(rgb, 2, 1, RGBAFormat, UnsignedByteType);
  featureValueToColor.needsUpdate = true;

  return {
    idsToFeatureValue,
    featureValueToColor,
    useRepeatingColor: true,
    frameToGlobalIdLookup,
    inRangeIds: inertTexture(),
    outlierData: inertTexture(),
    featureMin: 0,
    featureMax: 1,
    outlineColor: highlight,
    outlinePalette: inertTexture(),
    useOutlinePalette: false,
    innerOutlineColor: highlight,
    innerOutlineThickness: 0,
    outlineAlpha: 1,
    outlierColor: highlight,
    outOfRangeColor: highlight,
    outlierDrawMode: 0,
    outOfRangeDrawMode: 0,
    hideOutOfRange: false,
  };
}
