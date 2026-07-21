import * as zarr from "zarrita";
import type { Readable } from "@zarrita/storage";

import type { MeasurementTable } from "../../state/selection";
import { makeObjectKey, type ObjectKey } from "./objectKey";

/** Any zarrita-compatible store (FetchStore for URLs, ZipStore for local zips). */
type ZarrStore = Readable;

/**
 * Feature columns that may hold the timepoint of each row, in priority order. The pipeline writes `timestep`; the
 * others cover tables produced by ilastik or other tools.
 */
const FRAME_COLUMNS = ["timestep", "frame", "t", "time"];

/**
 * Read the OME-Zarr `tables/measurements` group (written by the pipeline as an
 * AnnData table) into a {@link MeasurementTable}, keyed by `label_id`.
 *
 * Layout read (AnnData / Zarr v2):
 *  - `obs/label_id`  -> one label_id per object (int64 -> Number)
 *  - `var/_index`    -> the feature column names (vlen-utf8)
 *  - `X` (n_obs x n_features, row-major) -> the feature values
 *
 * `store` must be the SAME store used to load the image (so the table is read
 * from the same source — remote URL or local zip). Returns `null` when the
 * scene has no measurements table, so callers can degrade gracefully.
 */
export async function loadMeasurements(
  store: ZarrStore,
  tablePath = "/tables/measurements"
): Promise<MeasurementTable | null> {
  const root = zarr.root(store);

  // 1. label ids — required. Its absence means "no usable table for this scene".
  let labelIds: number[];
  try {
    const arr = await zarr.open(root.resolve(`${tablePath}/obs/label_id`), { kind: "array" });
    const chunk = await zarr.get(arr);
    labelIds = Array.from(chunk.data as ArrayLike<number | bigint>, (v) => Number(v));
  } catch {
    return null;
  }
  const nObs = labelIds.length;

  // 2. feature names (vlen-utf8 string array).
  let featureNames: string[] = [];
  try {
    const arr = await zarr.open(root.resolve(`${tablePath}/var/_index`), { kind: "array" });
    const chunk = await zarr.get(arr);
    featureNames = Array.from(chunk.data as ArrayLike<unknown>, (v) => String(v));
  } catch {
    featureNames = [];
  }

  // 3. feature matrix X (n_obs x n_features), row-major -> split into columns.
  const features: Record<string, number[]> = {};
  if (featureNames.length > 0) {
    try {
      const arr = await zarr.open(root.resolve(`${tablePath}/X`), { kind: "array" });
      const chunk = await zarr.get(arr);
      const data = chunk.data as ArrayLike<number | bigint>;
      const [rowStride, colStride] = chunk.stride as number[];
      featureNames.forEach((name, col) => {
        const values = new Array<number>(nObs);
        for (let row = 0; row < nObs; row++) {
          values[row] = Number(data[row * rowStride + col * colStride]);
        }
        features[name] = values;
      });
    } catch {
      // X missing/unreadable: keep the ids, expose no features.
    }
  }

  // 4. Per-row frame. Segmentation label ids are numbered per timepoint, so a label id alone does not identify an
  // object across time (see `objectKey`). The frame lives in a numeric column, which AnnData stores in `X` — hence we
  // look it up among the features rather than in `obs`. Tables without any of these columns are single-frame.
  const frames = FRAME_COLUMNS.map((name) => features[name]).find((column) => column !== undefined) ?? null;

  // 5. (frame, label_id) -> row index, for O(1) lookup on a pick.
  const index = new Map<ObjectKey, number>();
  labelIds.forEach((id, row) => index.set(makeObjectKey(frames ? frames[row] : 0, id), row));

  return { labelIds, frames, features, index };
}