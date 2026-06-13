import { ThreadableVolumeLoader } from "./IVolumeLoader.js";
import { OMEZarrLoader, type ZarrLoaderFetchOptions } from "./OmeZarrLoader.js";
import { JsonImageInfoLoader } from "./JsonImageInfoLoader.js";
import { RawArrayLoader, RawArrayLoaderOptions } from "./RawArrayLoader.js";
import { TiffLoader } from "./TiffLoader.js";
import ZipStore from "./zarr_utils/ZipStore.js";
import VolumeCache from "../VolumeCache.js";
import SubscribableRequestQueue from "../utils/SubscribableRequestQueue.js";

export { PrefetchDirection } from "./zarr_utils/types.js";

export const enum VolumeFileFormat {
  ZARR = "zarr",
  JSON = "json",
  TIFF = "tiff",
  DATA = "data",
}

// superset of all necessary loader options
export type CreateLoaderOptions = {
  fileType?: VolumeFileFormat;
  cache?: VolumeCache;
  queue?: SubscribableRequestQueue;
  scene?: number;
  fetchOptions?: ZarrLoaderFetchOptions;
  rawArrayOptions?: RawArrayLoaderOptions;
  /**
   * Local OME-Zarr sources packaged as `.zip` Blobs/Files, one per source.
   * When present (and `fileType` is ZARR), each zip is read in-place with lazy
   * per-chunk access instead of fetching over HTTP. `Blob`/`File` is
   * structured-cloneable, so this survives the postMessage to the load worker.
   * Each entry's optional `rootPath` points at the zarr group inside the zip;
   * if omitted it is auto-detected.
   */
  zipSources?: { data: Blob; rootPath?: string }[];
};

export function pathToFileType(path: string): VolumeFileFormat {
  if (path.endsWith(".json")) {
    return VolumeFileFormat.JSON;
  } else if (path.endsWith(".tif") || path.endsWith(".tiff")) {
    return VolumeFileFormat.TIFF;
  }
  return VolumeFileFormat.ZARR;
}

export async function createVolumeLoader(
  path: string | string[],
  options?: CreateLoaderOptions
): Promise<ThreadableVolumeLoader> {
  const pathString = Array.isArray(path) ? path[0] : path;
  const fileType = options?.fileType || pathToFileType(pathString);
  const pathArrayForTiffLoader = Array.isArray(path) ? path : [path];

  switch (fileType) {
    case VolumeFileFormat.ZARR: {
      const zipStores = options?.zipSources?.map((src) => new ZipStore(src.data, src.rootPath));
      // When loading from local zips, the path(s) are only logical labels.
      const zarrPath = options?.zipSources ? options.zipSources.map((_, i) => `zip://${i}`) : path;
      return await OMEZarrLoader.createLoader(
        zarrPath,
        options?.scene,
        options?.cache,
        options?.queue,
        options?.fetchOptions,
        zipStores
      );
    }
    case VolumeFileFormat.JSON:
      return new JsonImageInfoLoader(path, options?.cache);
    case VolumeFileFormat.TIFF:
      return new TiffLoader(pathArrayForTiffLoader);
    case VolumeFileFormat.DATA:
      if (!options?.rawArrayOptions) {
        throw new Error("Must provide RawArrayOptions for RawArrayLoader");
      }
      return new RawArrayLoader(options?.rawArrayOptions.data, options?.rawArrayOptions.metadata);
  }
}
