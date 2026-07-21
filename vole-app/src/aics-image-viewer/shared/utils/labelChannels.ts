import type { Volume } from "@aics/vole-core";

/** A channel that came from the OME-Zarr `labels/` group rather than the image itself. */
type LabelChannel = { name: string; channelIndex: number };

/**
 * Channels of `volume` that hold object ids (a `labels/` image) rather than intensities.
 *
 * The loader runs in a web worker, so it passes this list through `ImageInfo.userData` — the extension point that
 * survives serialization to the main thread. Returns `[]` for any image without a usable `labels/` group.
 */
export function getLabelChannels(volume: Volume): LabelChannel[] {
  // `volume.imageInfo` is the computed wrapper; the raw (worker-serialized) record is nested inside it.
  const raw = volume.imageInfo.imageInfo.userData?.labelChannels;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (entry): entry is LabelChannel =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as LabelChannel).name === "string" &&
      Number.isInteger((entry as LabelChannel).channelIndex)
  );
}
