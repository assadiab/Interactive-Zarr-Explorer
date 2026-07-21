/**
 * Identity of one segmented object **at one timepoint**.
 *
 * A label id alone is not an identity: segmentation label images are numbered per frame, so label 7 in frame 0 and
 * label 7 in frame 1 are usually different objects. Every selection, gate and annotation is therefore keyed by the
 * composite `(frame, labelId)` — otherwise picking an object would light up unrelated voxels in every other frame.
 *
 * The pair is packed into a single number rather than a `"frame:label"` string: selections can hold hundreds of
 * thousands of entries, and a `Set<number>` is markedly faster and lighter than a `Set<string>`.
 *
 * Packing is exact as long as `labelId < 2^32` and `frame < 2^21` (~2.1M frames), which keeps the result below
 * `Number.MAX_SAFE_INTEGER`.
 */
declare const objectKeyBrand: unique symbol;

/**
 * Branded on purpose: a plain `number` must not be usable where a key is expected. Without the brand, passing a bare
 * `label_id` would compile silently and reintroduce exactly the time-blind behaviour this type exists to prevent.
 * Build keys with {@link makeObjectKey}.
 */
export type ObjectKey = number & { readonly [objectKeyBrand]: true };

/** Multiplier reserving the low 32 bits for the label id. */
const FRAME_STRIDE = 2 ** 32;

/** Largest label id that can be packed exactly. */
export const MAX_LABEL_ID = FRAME_STRIDE - 1;

/** Largest frame index that can be packed exactly (keeps the key under `Number.MAX_SAFE_INTEGER`). */
export const MAX_FRAME = Math.floor(Number.MAX_SAFE_INTEGER / FRAME_STRIDE);

/**
 * Pack a `(frame, labelId)` pair into an {@link ObjectKey}.
 *
 * Values outside the exactly-representable range are clamped rather than silently wrapping, so a malformed table can
 * never produce a key that collides with a real object.
 */
export function makeObjectKey(frame: number, labelId: number): ObjectKey {
  const f = Math.min(Math.max(Math.trunc(frame), 0), MAX_FRAME);
  const l = Math.min(Math.max(Math.trunc(labelId), 0), MAX_LABEL_ID);
  return (f * FRAME_STRIDE + l) as ObjectKey;
}

/** The frame an {@link ObjectKey} belongs to. */
export function objectKeyFrame(key: ObjectKey): number {
  return Math.floor(key / FRAME_STRIDE);
}

/** The label id an {@link ObjectKey} refers to, within its frame. */
export function objectKeyLabelId(key: ObjectKey): number {
  return key % FRAME_STRIDE;
}

/** Label ids of the keys that belong to `frame` — what the 3D view needs to highlight the current timepoint. */
export function labelIdsInFrame(keys: Iterable<ObjectKey>, frame: number): Set<number> {
  const out = new Set<number>();
  for (const key of keys) {
    if (objectKeyFrame(key) === frame) {
      out.add(objectKeyLabelId(key));
    }
  }
  return out;
}
