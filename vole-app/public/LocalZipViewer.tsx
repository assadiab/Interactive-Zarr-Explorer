import React, { useState } from "react";

import { ImageViewerApp } from "../src";
import type { ViewerChannelSettings } from "../src/aics-image-viewer/shared/utils/viewerChannelSettings";

/**
 * Standalone page (route `/local`) that loads a local OME-Zarr `.zip` straight
 * from an `<input type="file">`, with no landing page or routing state. The
 * measurement table and the Features (scatter) tab are handled inside `App`.
 */

const TOP_BAR_PX = 48;

/**
 * Enable the first three channels by default. OME-Zarr exported without `omero`
 * metadata (e.g. ilastik) has no per-channel defaults, so without this the viewer
 * is asked to load zero channels and the load spinner never resolves. Mirrors the
 * working "Load .zip" flow in website/components/Modals/LoadModal.tsx.
 */
const DEFAULT_CHANNEL_SETTINGS: ViewerChannelSettings = {
  groups: [
    {
      name: "Channels",
      channels: [
        { match: [0, 1, 2], enabled: true },
        { match: "(.+)", enabled: false },
      ],
    },
  ],
};

export default function LocalZipViewer(): React.ReactElement {
  const [zipFile, setZipFile] = useState<File | undefined>(undefined);

  // The measurement table is loaded inside `App` (keyed on `zipData`), so this
  // page only has to hand the picked file to the viewer.
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          height: TOP_BAR_PX,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <input type="file" accept=".zip,application/zip" onChange={(e) => setZipFile(e.target.files?.[0])} />
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {zipFile && (
          <ImageViewerApp
            key={zipFile.name}
            imageUrl=""
            zipData={zipFile}
            viewerChannelSettings={DEFAULT_CHANNEL_SETTINGS}
            cellId=""
            imageDownloadHref=""
            parentImageDownloadHref=""
            appHeight={`calc(100vh - ${TOP_BAR_PX}px)`}
            canvasMargin="0 0 0 0"
          />
        )}
      </div>
    </div>
  );
}