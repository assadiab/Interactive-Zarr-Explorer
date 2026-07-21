import * as zarr from "zarrita";
import type { AsyncReadable } from "zarrita";

import type VolumeCache from "../../VolumeCache.js";
import type SubscribableRequestQueue from "../../utils/SubscribableRequestQueue.js";
import type { NumericZarrArray, ZarrSource } from "./types.js";
import { remapAxesToTCZYX } from "./utils.js";
import { toOMEZarrMetaV4 } from "./validation.js";
import wrapArray from "./wrappers.js";

/** One label image found under the OME-Zarr `labels/` group. */
export type LabelSource = {
  /** Name of the label image, as listed in `labels/.zattrs` (e.g. `"segmentation"`). */
  name: string;
  /** The label image itself, shaped like any other source so it can be treated as a channel. */
  source: ZarrSource;
};

/**
 * Open the optional NGFF `labels/` group of an OME-Zarr store.
 *
 * The spec puts label images in a `labels/` group whose attributes list their names
 * (`{"labels": ["segmentation"]}`); each `labels/<name>` is itself a multiscale image. Label rasters usually have no
 * channel axis (T,Z,Y,X), which the rest of the loader already handles — a source without a channel axis counts as
 * exactly one channel.
 *
 * A missing or malformed `labels/` group is not an error: most images have none, so we probe and return `[]`.
 *
 * ⚠️ Callers must check the scale-level count before appending these to the image's sources. `matchSourceScaleLevels`
 * keeps only the levels present in *every* source, so a single-level label image would silently collapse a
 * multi-level image down to full resolution — defeating the multiscale pyramid on large volumes.
 */
export async function openLabelSources(
  root: zarr.Location<AsyncReadable<unknown>>,
  url: string,
  cache?: VolumeCache,
  queue?: SubscribableRequestQueue
): Promise<LabelSource[]> {
  let labelsGroup: Awaited<ReturnType<typeof zarr.open>>;
  try {
    labelsGroup = await zarr.open(root.resolve("labels"), { kind: "group" });
  } catch {
    return []; // no `labels/` group — the common case, not an error
  }

  const attrs = toOMEZarrMetaV4(labelsGroup.attrs) as { labels?: unknown };
  const names = Array.isArray(attrs.labels) ? attrs.labels.filter((n): n is string => typeof n === "string") : [];
  if (names.length === 0) {
    return [];
  }

  const results: LabelSource[] = [];
  for (const name of names) {
    try {
      const labelRoot = root.resolve(`labels/${name}`);
      const group = await zarr.open(labelRoot, { kind: "group" });
      const meta = toOMEZarrMetaV4(group.attrs) as { multiscales?: ZarrSource["multiscaleMetadata"][] };
      const multiscaleMetadata = meta.multiscales?.[0];
      if (!multiscaleMetadata?.datasets?.length) {
        console.warn(`OMEZarrLoader: label image "${name}" has no multiscales metadata; skipping.`);
        continue;
      }

      const scaleLevels = (await Promise.all(
        multiscaleMetadata.datasets.map(({ path }) =>
          zarr.open(labelRoot.resolve(path), { kind: "array" }).then((array) => wrapArray(array, url, cache, queue))
        )
      )) as NumericZarrArray[];

      results.push({
        name,
        source: {
          scaleLevels,
          multiscaleMetadata,
          axesTCZYX: remapAxesToTCZYX(multiscaleMetadata.axes),
          channelOffset: 0,
        },
      });
    } catch (e) {
      // A broken label image must never prevent the image itself from loading.
      console.warn(`OMEZarrLoader: failed to open label image "${name}":`, e);
    }
  }
  return results;
}

/**
 * Keep only the label sources whose pyramid matches the image's, so appending them cannot collapse it.
 *
 * With a matching pyramid a label image is just another channel and everything downstream works unchanged. With a
 * shorter one (a producer that wrote a single full-resolution level) we drop it and say so loudly: silently loading
 * it would force full-resolution loads of the whole volume.
 */
export function selectPyramidCompatibleLabels(labels: LabelSource[], imageLevelCount: number): LabelSource[] {
  return labels.filter(({ name, source }) => {
    const levels = source.scaleLevels.length;
    if (levels >= imageLevelCount) {
      return true;
    }
    console.warn(
      `OMEZarrLoader: label image "${name}" has ${levels} scale level(s) but the image has ${imageLevelCount}. ` +
        `Loading it would drop the image down to ${levels} level(s) and force full-resolution loads, so it is ` +
        `skipped. Re-export the labels with a multiscale pyramid (nearest-neighbour downsampling) to use them.`
    );
    return false;
  });
}
