import { Color, DataTexture, FloatType, RedFormat, RedIntegerFormat, RGBAFormat, UnsignedByteType, UnsignedIntType } from "three";

import { objectKeyFrame, objectKeyLabelId, type ObjectKey } from "./objectKey";

/**
 * Builds what the engine needs to paint the selected objects in the 3D view.
 *
 * `View3d.setChannelColorizeFeature` takes a full `ColorizeFeature` — the machinery the
 * upstream colorizer uses to map a feature value onto every object, through two data
 * textures and a per-frame lookup. Highlighting a selection needs far less than that: an
 * object is either picked or it is not. So this builds the smallest structure that says so.
 *
 * "Smallest" is not "emptiest", though: the shader gates every object on `inRangeIds`, so those
 * per-object buffers have to be filled in for real. Only the outline palette is genuinely
 * unused, and even it has to be the right sampler type.
 *
 * The one non-obvious part is `frameToGlobalIdLookup`. The shader reads a raw pixel value
 * (the segmentation label id) and has to turn it into an index into the feature textures,
 * per frame — label ids are numbered per timepoint, so the same id in two frames is two
 * different objects. The lookup is a texture indexed by `segId - minSegId`, holding
 * `globalId + 1` (0 meaning "no object here").
 *
 * That lookup has to cover every label id the raster can contain, not just the selected ones,
 * and this is the part that is easy to get wrong. `texelFetch` past the end of a texture is
 * undefined in GLSL, and the engine's accessor computes `ivec2(i % width, i / width)` — so an
 * out-of-range id was observed folding back onto row 0 rather than reading as nothing, which
 * made every unselected object resolve to a *selected* one and turned the whole segmentation
 * red. There is no in-shader guard against that, so the only real fix is to leave no id out of
 * range: `minSegId` is always 0 and the table runs from id 0 up to `labelIdCeiling`, which the
 * caller must set to a genuine upper bound on the raster's ids. The trailing zero entry is
 * belt-and-braces, not a guarantee.
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
 *
 * `minSegId` is always 0: see the note on out-of-range `texelFetch` above. It stays in the
 * shape because the engine reads it as the shader's `segIdOffset`.
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
 *
 * `labelIdCeiling` must be an upper bound on the label ids the raster holds — anything above it
 * reads out of range, which is undefined and in practice folds onto a selected entry. Each
 * frame's array spans `0..ceiling` plus one trailing zero. Callers with no bound to offer can
 * leave it at 0 and still get a table covering every id below the largest selected one.
 */
export function packSelectionLookups(
  selected: Iterable<ObjectKey>,
  labelIdCeiling = 0
): {
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
    // +2 rather than +1: one entry for the ceiling id itself, one zero entry past it.
    const span = Math.max(labelIdCeiling, labelIds[labelIds.length - 1]) + 2;
    const segIdToGlobalId = new Uint32Array(span);
    for (const labelId of labelIds) {
      // +1 because 0 means "no object mapped here".
      segIdToGlobalId[labelId] = nextGlobalId + 1;
      nextGlobalId += 1;
    }
    frames.set(frame, { minSegId: 0, segIdToGlobalId });
  }

  return { frames, objectCount: nextGlobalId };
}

/**
 * Widest a per-object buffer gets before it wraps onto another row, to stay well inside every
 * driver's maximum texture size. The shader reads these buffers as
 * `texelFetch(tex, ivec2(i % width, i / width))`, so wrapping costs nothing.
 */
const MAX_TEXTURE_WIDTH = 4096;

/** Rows and columns for `count` per-object entries, padded to a whole rectangle. */
function perObjectGrid(count: number): { width: number; height: number; length: number } {
  const width = Math.min(count, MAX_TEXTURE_WIDTH);
  const height = Math.ceil(count / width);
  return { width, height, length: width * height };
}

/** Lays a `uint` buffer out as a texture, zero-padded to a whole rectangle. */
function uintTexture(values: Uint32Array<ArrayBuffer>): DataTexture {
  const { width, height, length } = perObjectGrid(values.length);
  let data = values;
  if (length !== values.length) {
    data = new Uint32Array(length);
    data.set(values);
  }
  const texture = new DataTexture(data, width, height, RedIntegerFormat, UnsignedIntType);
  texture.needsUpdate = true;
  return texture;
}

/**
 * A per-object `uint` buffer holding `value` for each selected object.
 *
 * `inRangeIds` is why this exists rather than a shared 1×1 stub. `colorizeUI.frag` colours an
 * object only when its entry here is 1; every other object falls through to
 * `outOfRangeDrawMode`, which is `DRAW_MODE_HIDE` — alpha 0. A selection whose ids are not
 * marked in range is therefore drawn correctly and invisibly, which looks exactly like the
 * highlight never running at all.
 */
function perObjectUintTexture(count: number, value: number): DataTexture {
  const data = new Uint32Array(count);
  data.fill(value);
  return uintTexture(data);
}

/** A per-object float buffer holding `value` for each selected object. */
function perObjectFloatTexture(count: number, value: number): DataTexture {
  const { width, height, length } = perObjectGrid(count);
  const data = new Float32Array(length);
  data.fill(value, 0, count);
  const texture = new DataTexture(data, width, height, RedFormat, FloatType);
  texture.needsUpdate = true;
  return texture;
}

/**
 * A 1×1 RGBA texture for the outline palette, which this feature does not use.
 *
 * It must still be a *float* texture: `contour.frag` declares `outlinePalette` as `sampler2D`,
 * and WebGL2 rejects an integer texture bound to a float sampler when it validates the draw
 * call — regardless of `useOutlinePalette` being false, since validation does not follow
 * branches.
 */
function inertPaletteTexture(): DataTexture {
  const texture = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, RGBAFormat, UnsignedByteType);
  texture.needsUpdate = true;
  return texture;
}

/** The feature value every selected object carries; picks out texel 1 of the two-entry ramp. */
const SELECTED_FEATURE_VALUE = 1;

/**
 * Turns the current selection into a colorize feature that paints picked objects in
 * `highlight`, or `null` when nothing is selected — which is what the caller should hand
 * back to the engine to clear the highlight.
 */
export function buildSelectionColorize(
  selected: Iterable<ObjectKey>,
  highlight: Color,
  labelIdCeiling = 0
): SelectionColorize | null {
  const { frames, objectCount } = packSelectionLookups(selected, labelIdCeiling);
  if (objectCount === 0) {
    return null;
  }

  const frameToGlobalIdLookup = new Map<number, { texture: DataTexture; minSegId: number }>();
  for (const [frame, { minSegId, segIdToGlobalId }] of frames) {
    frameToGlobalIdLookup.set(frame, { texture: uintTexture(segIdToGlobalId), minSegId });
  }

  // Every selected object carries the same value, so the ramp only has to hold one color.
  const idsToFeatureValue = perObjectFloatTexture(objectCount, SELECTED_FEATURE_VALUE);

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
    // Marks every selected object as in range, which is what makes it drawn at all.
    inRangeIds: perObjectUintTexture(objectCount, 1),
    // No object is an outlier: an outlier would be painted `outlierColor` instead.
    outlierData: perObjectUintTexture(objectCount, 0),
    featureMin: 0,
    featureMax: 1,
    outlineColor: highlight,
    outlinePalette: inertPaletteTexture(),
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
