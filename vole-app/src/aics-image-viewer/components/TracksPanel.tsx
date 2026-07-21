import { InputNumber, Switch } from "antd";
// Value import (not `import type`): this component returns JSX, which compiles to `React.createElement`.
import React from "react";

import { select, useViewerState } from "../state/store";

/** Default tail, in frames, when the user turns off "full history" (matches the napari proof-of-concept). */
const DEFAULT_TAIL_FRAMES = 15;

const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 };

/**
 * Controls for the tracking overlay: which layers are drawn and how much trajectory history trails behind the current
 * frame. Only meaningful once a tracking CSV has been loaded (see `App`'s `tracksCsv` prop).
 */
const TracksPanel: React.FC = () => {
  const tracking = useViewerState(select("tracking"));
  const { showTracks, showDetections, tailLength } = useViewerState(select("trackSettings"));
  const setTrackSettings = useViewerState(select("setTrackSettings"));

  if (!tracking) {
    return (
      <p style={{ fontSize: 12 }}>
        <i>No tracking data loaded. Add a tracking CSV in the Load .zip dialog to overlay trajectories.</i>
      </p>
    );
  }

  const fullHistory = !Number.isFinite(tailLength);

  return (
    <div>
      <p style={{ fontSize: 12, marginBottom: 12 }}>
        <i>
          {tracking.tracks.length} tracks · frames {tracking.tMin}–{tracking.tMax} · {tracking.hasZ ? "3D" : "2D"}
        </i>
      </p>

      <div style={rowStyle}>
        <Switch
          size="small"
          checked={showTracks}
          onChange={(checked) => setTrackSettings({ showTracks: checked })}
          aria-label="Show trajectories"
        />
        <span>Trajectories</span>
      </div>

      <div style={rowStyle}>
        <Switch
          size="small"
          checked={showDetections}
          onChange={(checked) => setTrackSettings({ showDetections: checked })}
          aria-label="Show detections"
        />
        <span>Detections</span>
      </div>

      <div style={rowStyle}>
        <Switch
          size="small"
          checked={fullHistory}
          onChange={(checked) => setTrackSettings({ tailLength: checked ? Infinity : DEFAULT_TAIL_FRAMES })}
          aria-label="Show full track history"
        />
        <span>Full history</span>
      </div>

      {!fullHistory && (
        <div style={rowStyle}>
          <span>Tail</span>
          <InputNumber
            size="small"
            min={1}
            max={1000}
            value={tailLength}
            onChange={(value) => {
              if (typeof value === "number") {
                setTrackSettings({ tailLength: value });
              }
            }}
            style={{ width: 80 }}
          />
          <span style={{ fontSize: 12 }}>frames</span>
        </div>
      )}
    </div>
  );
};

export default TracksPanel;
