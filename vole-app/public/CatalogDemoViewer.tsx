import React from "react";

import { ImageViewerApp } from "../src";
import type { CidCatalog } from "../src/aics-image-viewer/shared/utils/cidCatalog";
import type { ViewerChannelSettings } from "../src/aics-image-viewer/shared/utils/viewerChannelSettings";

/**
 * Standalone page (route `/catalog`) that exercises the dataset explorer without a host
 * application.
 *
 * A catalog normally comes from a host that knows which datasets are related — that is the
 * whole point of the contract, and the viewer cannot invent it. This page stands in for
 * such a host: it declares a lineage over public OME-Zarr URLs so the explorer, the two
 * display modes and the scene picker can be exercised end to end.
 *
 * The lineage below is INVENTED. These files are unrelated samples; nothing derived
 * "Variance 2" from "Variance 1". It is shaped like a real acquisition tree only so the
 * tree, the checkboxes and the ordering can be seen working.
 */

const TOP_BAR_PX = 48;

const SAMPLE_BASE = "https://animatedcell-test-data.s3.us-west-2.amazonaws.com";

/**
 * Enable the first three channels. Without per-channel defaults the viewer is asked to load
 * ZERO channels and the load spinner never resolves — a black canvas that looks like a
 * failed fetch. Any host embedding the viewer has to supply this (or rely on `omero`
 * metadata carrying it); see the same guard in LocalZipViewer.
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

const DEMO_CATALOG: CidCatalog = {
  initialOpenId: "variance-1",
  datasets: [
    { id: "variance-1", name: "Variance — acquisition", url: `${SAMPLE_BASE}/variance/1.zarr` },
    { id: "variance-2", name: "Variance — derived", url: `${SAMPLE_BASE}/variance/2.zarr`, parentId: "variance-1" },
    { id: "mitosis", name: "Mitosis timelapse", url: `${SAMPLE_BASE}/timelapse/timeseries_mitosis.zarr` },
  ],
};

export default function CatalogDemoViewer(): React.ReactElement {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          height: `${TOP_BAR_PX}px`,
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "0 16px",
          borderBottom: "1px solid #ddd",
          fontSize: "13px",
        }}
      >
        <strong>Catalog demo</strong>
        <span>
          Stands in for a host application. Open the <em>Datasets</em> button in the toolbar, then check
          several entries and switch between side by side and overlaid.
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ImageViewerApp
          cidCatalog={DEMO_CATALOG}
          viewerChannelSettings={DEFAULT_CHANNEL_SETTINGS}
          // Required by the type, unused while a catalog is in play.
          imageUrl=""
          cellId=""
          imageDownloadHref=""
          parentImageDownloadHref=""
          // Viewport-based: "100%" collapses the WebGL canvas to zero height.
          appHeight={`calc(100vh - ${TOP_BAR_PX}px)`}
          canvasMargin="0 0 0 0"
        />
      </div>
    </div>
  );
}
