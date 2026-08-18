import type { RawArrayData, RawArrayInfo, View3d, Volume } from "@aics/vole-core";
import type { MutableRefObject } from "react";

import type { CidCatalog } from "../../shared/utils/cidCatalog";
import type { MetadataRecord } from "../../shared/types";
import type { ViewerChannelSettings } from "../../shared/utils/viewerChannelSettings";
import type { ViewerState } from "../../state/types";

/** `typeof useEffect`, but the effect handler takes a `Volume` as an argument */
export type UseImageEffectType = (effect: (image: Volume) => void | (() => void), deps: React.DependencyList) => void;

type ControlNames =
  | "alphaMaskSlider"
  | "autoRotateButton"
  | "axisClipSliders"
  | "brightnessSlider"
  | "backgroundColorPicker"
  | "boundingBoxColorPicker"
  | "colorPresetsDropdown"
  | "densitySlider"
  | "levelsSliders"
  | "interpolationControl"
  | "saveSurfaceButtons"
  | "fovCellSwitchControls"
  | "viewModeRadioButtons"
  | "resetCameraButton"
  | "showAxesButton"
  | "showBoundingBoxButton"
  | "metadataViewer"
  | "scaleLevelControls";
/** Show/hide different elements of the UI */
export type ControlVisibilityFlags = { [K in ControlNames]: boolean };

export type MultisceneUrls = { scenes: (string | string[])[] };

/**
 * Local-zip equivalent of {@link MultisceneUrls}. Each scene is one `Blob` (single
 * volume) or an array of `Blob`s (their channels appended into one volume). Mirrors
 * the comma/plus URL semantics: `Blob[]` = overlay (`,`), `scenes` = multiple (`+`).
 */
export type MultisceneZips = { scenes: (Blob | Blob[])[] };

export interface AppProps {
  // FIRST WAY TO GET DATA INTO THE VIEWER: pass in volume data directly

  // rawData has a "dtype" which is expected to be "uint8", a "shape":[c,z,y,x] and a "buffer" which is a DataView
  rawData?: RawArrayData;
  // rawDims is a small amount of metadata (e.g. dimensions and channel names) to be converted internally to an ImageInfo
  rawDims?: RawArrayInfo;

  // SECOND WAY TO GET DATA INTO THE VIEWER: (if `rawData`/`rawDims` isn't present) pass in URL(s) to fetch volume data

  /**
   * URL(s) from which to fetch the image. You can pass a `string` to load from a single data source, or get fancier:
   * - Pass an array of strings to assemble a single volume with all sources' channels, in order.
   * - Pass an object with a key `scenes: (string | string[])[]` to load multiple volumes as a *multi-scene collection*.
   *   Each string or string array within the `scenes` array is treated as a single volume with one or more sources.
   */
  imageUrl: string | MultisceneUrls;
  parentImageUrl?: string | MultisceneUrls;

  // THIRD WAY TO GET DATA INTO THE VIEWER: pass a local OME-Zarr packaged as a `.zip`

  /**
   * A local OME-Zarr packaged as a `.zip` `Blob`/`File`. Takes precedence over
   * `imageUrl` when set. The zip is read in-place with lazy per-chunk access —
   * no HTTP server and no full extraction. Prefer zipping in STORE mode so the
   * already-compressed Zarr chunks aren't double-compressed.
   *
   * Pass a single `Blob` for one volume, a `Blob[]` to overlay several same-sized
   * zarrs' channels in one volume, or a {@link MultisceneZips} for multiple scenes.
   */
  zipData?: Blob | Blob[] | MultisceneZips;
  /** Path to the zarr group inside each zip. Omit to auto-detect. */
  zipRootPath?: string;
  /**
   * Labels for the scene picker, one per scene, in scene order. Omit to let the viewer
   * name scenes itself (file names for a `File`, URLs for a URL source, else "Scene N").
   *
   * Needed whenever the scenes come from plain `Blob`s: a `Blob` fetched by a host
   * application carries no `name`, so the derived labels would all read "Scene N".
   * Entries past the end of the list — or empty ones — fall back to the derived name,
   * so a partial list is safe.
   */
  sceneNames?: string[];
  /**
   * Optional ilastik-style tracking result to overlay as trajectories on the volume. Read separately from the zarr
   * (nothing is written back). Pass the CSV text directly (e.g. pushed by an automated pipeline) or a `File` (e.g. from
   * a file picker); either is parsed by `parseTracksCsv`.
   */
  tracksCsv?: string | File;

  /**
   * Total bytes one volume's channel textures may occupy on the GPU. Defaults to 1 GiB.
   *
   * Raise it on machines with plenty of VRAM to keep a finer scale level; lower it if the
   * viewer is one of several things sharing the card. The viewer picks the finest multiscale
   * level that stays within it — which, unlike the atlas edge limit alone, accounts for how
   * many channels a volume carries.
   */
  maxAtlasBytes?: number;
  // FOURTH WAY TO GET DATA INTO THE VIEWER: let the user pick from a catalog the host declares

  /**
   * Related datasets the host offers, browsable from an explorer inside the viewer.
   *
   * Takes precedence over `zipData` when set, and is then the ONLY source of data: the
   * starting image is declared as `initialOpenId` rather than pushed separately, so there
   * is never a question of which source wins. Absent, nothing about the other entry points
   * changes.
   *
   * The host keeps its database — the viewer only ever sees ids, names, a parent link and
   * the blobs {@link CidCatalog.loadDataset} hands back.
   */
  cidCatalog?: CidCatalog;

  viewerChannelSettings?: ViewerChannelSettings;

  appHeight: string;
  cellId: string;
  visibleControls?: Partial<ControlVisibilityFlags>;
  viewerSettings?: Partial<ViewerState>;
  imageDownloadHref: string;
  parentImageDownloadHref: string;
  pixelSize?: [number, number, number];
  canvasMargin: string;
  transform?: {
    translation: [number, number, number];
    rotation: [number, number, number];
  };
  metadata?: MetadataRecord | (MetadataRecord | undefined)[];

  view3dRef?: MutableRefObject<View3d | null>;
  metadataFormatter?: (metadata: MetadataRecord) => MetadataRecord;
  onControlPanelToggle?: (collapsed: boolean) => void;
  showError?: (error: unknown, image?: Volume) => void;
  onImageTitleChange?: (title: string | undefined) => void;
}
