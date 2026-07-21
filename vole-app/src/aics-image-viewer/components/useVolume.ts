import { LoadSpec, type View3d, type Volume, VolumeLoaderContext } from "@aics/vole-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box3, Vector3 } from "three";

import {
  AXIS_TO_LOADER_PRIORITY,
  CACHE_MAX_SIZE,
  getDefaultViewerChannelSettings,
  QUEUE_MAX_LOW_PRIORITY_SIZE,
  QUEUE_MAX_SIZE,
} from "../shared/constants";
import { ViewMode } from "../shared/enums";
import type { AxisName } from "../shared/types";
import { useConstructor, useRefWithSetter } from "../shared/utils/hooks";
import { getLabelChannels } from "../shared/utils/labelChannels";
import PlayControls from "../shared/utils/playControls";
import SceneStore, { type ScenePath } from "../shared/utils/sceneStore";
import type { ChannelGrouping, ViewerChannelSettings } from "../shared/utils/viewerChannelSettings";
import { makeChannelIndexGrouping } from "../shared/utils/viewerChannelSettings";
import { select, useViewerState } from "../state/store";
import type { ChannelState } from "../state/types";

export type UseVolumeOptions = {
  viewerChannelSettings?: ViewerChannelSettings;
  /** Callback called just once when the volume is created. */
  onCreateImage?: (image: Volume) => void;
  /** Callback called on any scene change, including the initial image load. */
  onChangeScene?: (image: Volume, sceneIndex: number, loadSpec: LoadSpec) => void;
  /** Callback for when a single channel of the volume has loaded. */
  onChannelLoaded?: (image: Volume, channelIndex: number, isInitialLoad: boolean) => void;
  /** Callback for when image loading encounters an error. */
  onError?: (error: unknown, image?: Volume) => void;
  /** The name of a channel which should be treated as a mask rather than as viewable data. */
  maskChannelName?: string;
};

export const enum ImageLoadStatus {
  REQUESTED,
  LOADING,
  LOADED,
  ERROR,
}

const enum LoadType {
  TIME,
  SCENE,
}

// Used by `channelVersions` (see below)
const CHANNEL_INITIAL_LOAD = -1;
const CHANNEL_RELOAD = 0;

export type ReactiveVolume = {
  image: Volume | null;
  /**
   * Indicates the load status of each channel:
   *
   * - `-1` indicates the channel has not yet loaded and will get some extra initialization (e.g. LUTs) when it loads.
   * - `0` indicates the channel has been loaded once, but is currently waiting for new data.
   * - `1` or greater indicates the channel is loaded. Note this is not exactly `1` to handle multiple simultaneous
   *   loads; if multiple loads are issued before the first one completes, _incrementing_ rather than _setting_ the
   *   version number means we react to each load when it completes, rather than just the first.
   */
  channelVersions: number[];
  imageLoadStatus: ImageLoadStatus;
  setTime: (view3d: View3d, time: number) => void;
  setScene: (scene: number) => void;
  playControls: PlayControls;
  playingAxis: AxisName | "t" | null;
  channelGroupedByType: ChannelGrouping;
};

/**
 * Temporary hack while `useEffectEvent` is still experimental.
 *
 * Some functions play the role of event handlers (called to notify that something has happened) _within_ an effect.
 * Without any intervention, the linter will insist the function needs to be in the effect's dependencies, even though
 * it would make no sense to re-run the effect when the handler changes. So we hide the function behind a stable ref.
 *
 * See https://react.dev/learn/separating-events-from-effects#declaring-an-effect-event
 */
const useEffectEventRef = <T extends (...args: any[]) => void>(callback: T | undefined): T => {
  const callbackRef = useRef<T | undefined>(callback);
  callbackRef.current = callback;
  return useCallback(((...args): void => callbackRef.current?.(...args)) as T, [callbackRef]);
};

/**
 * Hook to open a volume from one or more sources (URLs or raw data) and provide controls for (re)loading and playback.
 *
 * @param scenePaths An array of volume data sources, one per scene. These can be:
 * - a string URL to a single source, or
 * - an array of strings to load multiple sources as a single volume, or
 * - a `RawArrayLoaderOptions` object to load raw data directly.
 * @param options An optional object with callbacks and other info. See docs for `UseVolumeOptions`.
 * @returns An object with the current image, its load status, and controls for playback and loading.
 */
const useVolume = (
  scenePaths: ScenePath[],
  options?: UseVolumeOptions
): ReactiveVolume => {
  const channelSettings = useViewerState(select("channelSettings"));
  const changeViewerSetting = useViewerState(select("changeViewerSetting"));
  const initChannelSettings = useViewerState(select("initChannelSettings"));

  const onErrorRef = useEffectEventRef(options?.onError);
  const onChannelLoadedRef = useEffectEventRef(options?.onChannelLoaded);
  const onChangeSceneRef = useEffectEventRef(options?.onChangeScene);
  const onCreateImageRef = useEffectEventRef(options?.onCreateImage);
  const maskChannelName = options?.maskChannelName;

  // set up our big objects: the image, its loading infrastructure, and controls for playback
  const [image, setImage] = useState<Volume | null>(null);
  const loadContext = useConstructor(
    () => new VolumeLoaderContext(CACHE_MAX_SIZE, QUEUE_MAX_SIZE, QUEUE_MAX_LOW_PRIORITY_SIZE)
  );
  const sceneLoader = useMemo(() => new SceneStore(loadContext, scenePaths), [loadContext, scenePaths]);
  const playControls = useConstructor(() => new PlayControls());
  const [playingAxis, setPlayingAxis] = useState<AxisName | "t" | null>(null);
  useEffect(() => {
    playControls.onPlayingAxisChanged = (axis) => {
      const isPlaying = axis !== null;
      setPlayingAxis(axis);
      // prioritize prefetching along the playing axis
      sceneLoader.setPrefetchPriority(axis ? [AXIS_TO_LOADER_PRIORITY[axis]] : []);
      sceneLoader.updateFetchOptions({ onlyPriorityDirections: isPlaying });
      // sync multichannel loading so we don't show loaded channels one at a time
      sceneLoader.syncMultichannelLoading(isPlaying);
      if (image) {
        // If we're playing and entire axis is not in memory (T always, Z likely), downlevel to speed things up
        const { volumeSize, subregionSize } = image.imageInfo;
        const shouldDownlevel = isPlaying && (axis === "t" || volumeSize[axis] !== subregionSize[axis]);
        image.updateRequiredData({ scaleLevelBias: shouldDownlevel ? 1 : 0 });
      }
    };
  }, [sceneLoader, playControls, image]);

  // track which channels have been loaded
  const [channelVersions, _setChannelVersions] = useState<number[]>([]);
  const [channelVersionsRef, setChannelVersions] = useRefWithSetter(_setChannelVersions, channelVersions);

  // Some extra items for tracking load status
  const [loadThrewError, setLoadThrewError] = useState(false);
  const inInitialLoadRef = useRef(true);

  // derive whether the image is loaded from whether any and/or all channels are loaded
  const imageLoadStatus = useMemo(() => {
    if (loadThrewError) {
      return ImageLoadStatus.ERROR;
    }

    const [allLoaded, noneLoaded] = channelVersions.reduce(
      ([allLoaded, noneLoaded], version, idx) => {
        const setting = channelSettings[idx];
        if (setting && (setting.volumeEnabled || setting.isosurfaceEnabled || maskChannelName === setting.name)) {
          const loaded = version > 0;
          return [allLoaded && loaded, noneLoaded && !loaded];
        }
        return [allLoaded, noneLoaded];
      },
      [true, true]
    );

    if (allLoaded && inInitialLoadRef.current) {
      inInitialLoadRef.current = false;
    }

    return noneLoaded ? ImageLoadStatus.REQUESTED : allLoaded ? ImageLoadStatus.LOADED : ImageLoadStatus.LOADING;
  }, [channelVersions, channelSettings, maskChannelName, loadThrewError]);

  const setIsLoading = useCallback(
    (loadType: LoadType) => {
      setLoadThrewError(false);
      setChannelVersions(
        channelVersionsRef.current.map((version) =>
          // For scenes, reinitialize all channels.
          Math.min(version, loadType === LoadType.SCENE ? CHANNEL_INITIAL_LOAD : CHANNEL_RELOAD)
        )
      );
    },
    [channelVersionsRef, setChannelVersions]
  );

  const onError = useCallback(
    (e: unknown): never => {
      setLoadThrewError(true);
      onErrorRef(e);
      throw e;
    },
    [onErrorRef]
  );

  // channel indexes, sorted by category
  const [channelGroupedByType, setChannelGroupedByType] = useState<ChannelGrouping>({});

  const onChannelDataLoaded = useCallback(
    (aimg: Volume, channelIndex: number): void => {
      // let the hook caller know that this channel has loaded
      const isInitialLoad = channelVersionsRef.current[channelIndex] === CHANNEL_INITIAL_LOAD;
      onChannelLoadedRef(aimg, channelIndex, isInitialLoad);

      // set this channel as loaded
      const newVersions = channelVersionsRef.current.slice();
      newVersions[channelIndex] = Math.max(newVersions[channelIndex], CHANNEL_RELOAD) + 1;
      setChannelVersions(newVersions);

      // if the whole image has loaded, let `playControls` know (if we're playing, it may want to go to the next frame)
      if (aimg.isLoaded()) {
        playControls.onImageLoaded();
      }
    },
    [channelVersionsRef, onChannelLoadedRef, playControls, setChannelVersions]
  );

  // Per-scene channel settings. Scenes can be entirely unrelated volumes (different channels, dtypes, dimensions), so
  // each one keeps its own settings: edits (enabled, color, LUT, ...) are saved when leaving a scene and restored when
  // returning to it, instead of bleeding across scenes or being reset on every switch. Keyed by scene index.
  const channelSettingsBySceneRef = useRef<Map<number, ChannelState[]>>(new Map());
  // The scene whose settings currently live in the store; `null` until the first scene has loaded.
  const loadedSceneRef = useRef<number | null>(null);

  /** Save the store's current channel settings under the currently-loaded scene, so we can restore them later. */
  const persistCurrentSceneSettings = useCallback((): void => {
    if (loadedSceneRef.current !== null) {
      channelSettingsBySceneRef.current.set(loadedSceneRef.current, useViewerState.getState().channelSettings);
    }
  }, []);

  /**
   * Install the channel settings for the scene we're switching to. If we've visited this scene before (and its channel
   * names still match), restore the saved settings; otherwise initialize fresh defaults. Returns the settings plus a
   * `restored` flag so the caller can avoid re-initializing LUTs (which would clobber the user's saved edits).
   */
  const applyChannelSettingsForScene = useCallback(
    (sceneIndex: number, channelNames: string[]): { channelSettings: ChannelState[]; restored: boolean } => {
      const { useDefaultViewerChannelSettings, replaceAllChannelSettings } = useViewerState.getState();
      const viewerChannelSettings = useDefaultViewerChannelSettings
        ? getDefaultViewerChannelSettings()
        : options?.viewerChannelSettings;
      setChannelGroupedByType(makeChannelIndexGrouping(channelNames, viewerChannelSettings));

      const saved = channelSettingsBySceneRef.current.get(sceneIndex);
      const canRestore =
        !!saved && saved.length === channelNames.length && saved.every((s, i) => s.name === channelNames[i]);
      if (canRestore) {
        replaceAllChannelSettings(saved!);
        return { channelSettings: saved!, restored: true };
      }

      // Fresh scene: clear the store first so a shorter/different scene can't inherit the outgoing scene's settings by
      // index (`initChannelSettings` reuses same-index entries, which is only correct within a single scene).
      replaceAllChannelSettings([]);
      return { channelSettings: initChannelSettings(channelNames, viewerChannelSettings), restored: false };
    },
    [initChannelSettings, options?.viewerChannelSettings]
  );

  /**
   * Load `scene` as a brand-new `Volume` and swap it into the view. Building a fresh volume per scene (rather than
   * re-tasking one shared volume) keeps scenes isolated: a late in-flight chunk from a previously-viewed scene lands on
   * the old, now-removed volume instead of bleeding into the one currently on screen.
   */
  const loadSceneVolume = useCallback(
    async (scene: number): Promise<void> => {
      setLoadThrewError(false);
      inInitialLoadRef.current = true;

      const time = useViewerState.getState().time;

      const loadSpec = new LoadSpec();
      loadSpec.time = time;

      const aimg = await sceneLoader.createVolume(scene, loadSpec, onChannelDataLoaded).catch(onError);

      const channelNames = aimg.imageInfo.channelNames;
      const { channelSettings: newChannelSettings, restored } = applyChannelSettingsForScene(scene, channelNames);
      loadedSceneRef.current = scene;

      // Channels coming from the `labels/` group hold object ids, not intensities. Rendering them through a continuous
      // transfer function is meaningless, so switch them to Vol-E's categorical label palette (`colorizeEnabled` makes
      // `ChannelUpdater` build the LUT from the channel histogram once its data arrives).
      if (!restored) {
        const { changeChannelSetting } = useViewerState.getState();
        for (const { channelIndex } of getLabelChannels(aimg)) {
          changeChannelSetting(channelIndex, { colorizeEnabled: true, colorizeAlpha: 1 });
        }
      }

      // A restored scene keeps its saved LUTs, so mark its channels as reloading (not initial) to stop the app from
      // re-initializing them; a fresh scene initializes its LUTs on first load as usual.
      setChannelVersions(new Array(channelNames.length).fill(restored ? CHANNEL_RELOAD : CHANNEL_INITIAL_LOAD));
      setImage(aimg);

      // Removes the previous scene's volume from the view and adds this one, so only one scene is ever rendered.
      onCreateImageRef(aimg);

      playControls.stepAxis = (axis: AxisName | "t") => {
        const time = useViewerState.getState().time;
        const slice = useViewerState.getState().slice;

        if (axis === "t") {
          changeViewerSetting("time", (time + 1) % aimg.imageInfo.times);
        } else {
          const max = aimg.imageInfo.volumeSize[axis];
          const current = slice[axis] * max;
          changeViewerSetting("slice", { ...slice, [axis]: ((current + 1) % max) / max });
        }
      };
      playControls.getVolumeIsLoaded = aimg.isLoaded.bind(aimg);

      const requiredLoadSpec = new LoadSpec();
      requiredLoadSpec.time = time;

      // make the currently enabled channels "required":
      // find all enabled indices in newChannelSettings:
      const requiredChannelsToLoad = newChannelSettings
        ? newChannelSettings.map((channel, index) => (channel.volumeEnabled ? index : -1)).filter((index) => index >= 0)
        : [];

      // add mask channel to required channels, if specified
      const { useDefaultViewerChannelSettings } = useViewerState.getState();
      const viewerChannelSettings = useDefaultViewerChannelSettings
        ? getDefaultViewerChannelSettings()
        : options?.viewerChannelSettings;
      const maskChannelName = viewerChannelSettings?.maskChannelName;
      if (maskChannelName) {
        const maskChannelIndex = channelNames.indexOf(maskChannelName);
        if (maskChannelIndex >= 0 && !requiredChannelsToLoad.includes(maskChannelIndex)) {
          requiredChannelsToLoad.push(maskChannelIndex);
        }
      }
      requiredLoadSpec.channels = requiredChannelsToLoad;

      const viewMode = useViewerState.getState().viewMode;
      const slice = useViewerState.getState().slice;

      // When in 2D Z-axis view mode, we restrict the subregion to only the current slice. This is
      // to match an optimization that volume viewer does by loading Z-slices at a higher resolution,
      // and ensures the very first volume that is loaded is the same as the one that
      // will be shown whenever we switch back to the same viewer settings (2D Z-axis view mode).
      // (We don't do this for ZX and YZ modes because we assume that the data won't be chunked along the
      // X or Y axes in ways that would improve loading resolution, and we load the full 3D volume instead.)
      if (viewMode === ViewMode.xy) {
        requiredLoadSpec.subregion = new Box3(new Vector3(0, 0, slice.z), new Vector3(1, 1, slice.z));
      }

      // initiate loading only after setting up new channel settings,
      // in case the loader callback fires before the state is set
      sceneLoader.loadScene(scene, aimg, requiredLoadSpec, { onCreateScene: onChangeSceneRef }).catch(onError);
    },
    [
      sceneLoader,
      onError,
      onCreateImageRef,
      onChangeSceneRef,
      setChannelVersions,
      playControls,
      onChannelDataLoaded,
      changeViewerSetting,
      applyChannelSettingsForScene,
      options?.viewerChannelSettings,
    ]
  );

  // Start the initial load whenever a new set of scenes is loaded (`sceneLoader` changes => `loadSceneVolume` changes).
  useEffect(() => {
    // A brand-new set of scenes was loaded, so any saved per-scene settings from the previous dataset are stale.
    channelSettingsBySceneRef.current.clear();
    loadedSceneRef.current = null;
    loadSceneVolume(useViewerState.getState().scene);
  }, [loadSceneVolume]);

  const setTime = useCallback(
    (view3d: View3d, time: number): void => {
      if (image && !inInitialLoadRef.current) {
        view3d.setTime(image, time).catch(onError);
        setIsLoading(LoadType.TIME);
      }
    },
    [image, onError, setIsLoading, inInitialLoadRef]
  );

  const setScene = useCallback(
    (scene: number): void => {
      if (image && !inInitialLoadRef.current && scene !== loadedSceneRef.current) {
        // Stop playback before switching: the target scene may have fewer (or no) timesteps, and letting the play loop
        // keep advancing time would request an out-of-range frame on the new scene.
        playControls.pause();
        // Snapshot the scene we're leaving so the user's edits are there when they come back.
        persistCurrentSceneSettings();
        // Load the target scene as its own fresh volume (see `loadSceneVolume`) so scenes stay visually isolated.
        loadSceneVolume(scene);
      }
    },
    [image, playControls, persistCurrentSceneSettings, loadSceneVolume]
  );

  return useMemo(
    () => ({
      image,
      channelVersions,
      imageLoadStatus,
      setTime,
      setScene,
      playControls,
      playingAxis,
      channelGroupedByType,
    }),
    [image, channelVersions, imageLoadStatus, setTime, setScene, playControls, playingAxis, channelGroupedByType]
  );
};

export default useVolume;
