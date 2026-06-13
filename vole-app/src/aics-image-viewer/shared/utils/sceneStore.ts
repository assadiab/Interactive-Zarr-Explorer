import type {
  CreateLoaderOptions,
  LoadSpec,
  PrefetchDirection,
  RawArrayLoaderOptions,
  Volume,
  VolumeLoaderContext,
  ZarrLoaderFetchOptions,
} from "@aics/vole-core";
import { createDefaultMetadata, VolumeFileFormat } from "@aics/vole-core";
import type { ThreadableVolumeLoader } from "@aics/vole-core/es/types/loaders/IVolumeLoader";

export type LoadSceneOptions = {
  onCreateScene?: (volume: Volume, sceneIndex: number, loadSpec: LoadSpec) => void;
  onChannelLoaded?: (volume: Volume, channelIndex: number) => void;
};

/**
 * A local OME-Zarr packaged as a `.zip` Blob/File. Read in-place with lazy
 * per-chunk access (no server, no full extraction). `rootPath` points at the
 * zarr group inside the zip; omit it to auto-detect.
 */
export type ZipSource = { zip: Blob; rootPath?: string };

export type ScenePath = string | string[] | RawArrayLoaderOptions | ZipSource;

export default class SceneStore {
  context: VolumeLoaderContext;
  loaders: (ThreadableVolumeLoader | undefined)[];
  paths: ScenePath[];
  currentScene: number = 0;
  syncChannels: boolean = false;
  prefetchPriority: PrefetchDirection[] = [];

  constructor(context: VolumeLoaderContext, paths: ScenePath[]) {
    this.paths = paths;
    this.context = context;
    this.loaders = new Array(paths.length).fill(undefined);
  }

  /** Get the loader associated with the given scene index, or create it if it doesn't exist */
  private async getLoader(scene: number): Promise<ThreadableVolumeLoader> {
    this.currentScene = scene;
    let loader = this.loaders[scene];

    if (!loader) {
      let path = this.paths[scene];
      let options: Partial<CreateLoaderOptions> = {};
      if (typeof path === "object" && !Array.isArray(path)) {
        if ("zip" in path) {
          // Local OME-Zarr in a .zip: read in-place, lazily, no server.
          options.zipSources = [{ data: path.zip, rootPath: path.rootPath }];
          options.fileType = VolumeFileFormat.ZARR;
          path = "local.zip"; // logical label only; never fetched
        } else {
          options.rawArrayOptions = path;
          options.fileType = VolumeFileFormat.DATA;
          path = "";
        }
      }

      await this.context.onOpen();
      loader = await this.context.createLoader(path, options);
      this.loaders[scene] = loader;
    }

    loader.syncMultichannelLoading(this.syncChannels);
    loader.setPrefetchPriority(this.prefetchPriority);
    return loader;
  }

  public async loadScene(scene: number, image: Volume, loadSpec?: LoadSpec, options?: LoadSceneOptions): Promise<void> {
    const loader = await this.getLoader(scene);
    const spec = loadSpec ?? image.loadSpecRequired;

    image.loader = loader;
    const imageInfo = (await loader.createImageInfo(spec)).imageInfo;
    image.imageInfo.imageInfo = imageInfo;
    image.imageMetadata = createDefaultMetadata(imageInfo);

    const maxTime = imageInfo.multiscaleLevelDims[imageInfo.multiscaleLevel].shape[0] - 1;
    const adjustedSpec: LoadSpec = {
      ...spec,
      channels: spec.channels?.filter((channelIndex) => channelIndex < imageInfo.channelNames.length),
      time: Math.min(spec.time, maxTime),
    };

    options?.onCreateScene?.(image, scene, adjustedSpec);
    loader.loadVolumeData(image, adjustedSpec, options?.onChannelLoaded);
  }

  public async createVolume(
    scene: number,
    loadSpec: LoadSpec,
    onChannelLoaded?: (volume: Volume, channelIndex: number) => void
  ): Promise<Volume> {
    const loader = await this.getLoader(scene);
    return loader.createVolume(loadSpec, onChannelLoaded);
  }

  public syncMultichannelLoading(sync: boolean): void {
    this.syncChannels = sync;
    const currentLoader = this.loaders[this.currentScene];
    if (currentLoader) {
      currentLoader.syncMultichannelLoading(sync);
    }
  }

  public setPrefetchPriority(priority: PrefetchDirection[]): void {
    this.prefetchPriority = priority;
    const currentLoader = this.loaders[this.currentScene];
    if (currentLoader) {
      currentLoader.setPrefetchPriority(priority);
    }
  }

  public updateFetchOptions(fetchOptions: Partial<ZarrLoaderFetchOptions>): void {
    const currentLoader = this.loaders[this.currentScene];
    if (currentLoader) {
      currentLoader.updateFetchOptions(fetchOptions);
    }
  }
}
