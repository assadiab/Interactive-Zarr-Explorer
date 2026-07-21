import { Button, InputNumber, Select, Slider, Switch } from "antd";
// Value import (not `import type`): this component returns JSX, which compiles to `React.createElement`.
import React, { useMemo } from "react";

import { select, useViewerState } from "../state/store";
import { computeTrackStats } from "../shared/utils/trackStats";

/** Default tail, in frames, when the user turns off "full history" (matches the napari proof-of-concept). */
const DEFAULT_TAIL_FRAMES = 15;

// Use the theme's text colors rather than relying on inherited defaults, so the panel reads correctly on dark UI.
const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 10,
  color: "var(--color-text-body)",
};
const sectionTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  margin: "16px 0 8px",
  color: "var(--color-text-section)",
};
const statRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  color: "var(--color-text-body)",
};
const summaryStyle: React.CSSProperties = { marginBottom: 12, color: "var(--color-text-body)" };
// Keep every control inside the panel column: without this the sliders/select overflow the right panel.
const panelStyle: React.CSSProperties = { maxWidth: "100%", overflowX: "hidden", boxSizing: "border-box" };

/** Round to at most 2 decimals without trailing zeros. */
const fmt = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(2));

/**
 * Controls for the tracking overlay, in two levels: layer-style display options (what is drawn and how), and
 * inspection of a single track (its identity and derived statistics). Only meaningful once a tracking CSV is loaded.
 */
const TracksPanel: React.FC = () => {
  const tracking = useViewerState(select("tracking"));
  const { showTracks, showDetections, tailLength, opacity, lineWidth } = useViewerState(select("trackSettings"));
  const setTrackSettings = useViewerState(select("setTrackSettings"));
  const selectedTrackId = useViewerState(select("selectedTrackId"));
  const setSelectedTrackId = useViewerState(select("setSelectedTrackId"));

  const selectedTrack = useMemo(
    () => tracking?.tracks.find((t) => t.trackId === selectedTrackId),
    [tracking, selectedTrackId]
  );
  const stats = useMemo(() => (selectedTrack ? computeTrackStats(selectedTrack) : undefined), [selectedTrack]);
  const trackOptions = useMemo(
    () => tracking?.tracks.map((t) => ({ value: t.trackId, label: `Track ${t.trackId}` })) ?? [],
    [tracking]
  );

  if (!tracking) {
    return (
      <p style={{ color: "var(--color-text-body)" }}>
        <i>No tracking data loaded. Add a tracking CSV in the Load .zip dialog to overlay trajectories.</i>
      </p>
    );
  }

  const fullHistory = !Number.isFinite(tailLength);

  return (
    <div style={panelStyle}>
      <p style={summaryStyle}>
        {tracking.tracks.length} tracks · frames {tracking.tMin}–{tracking.tMax} · {tracking.hasZ ? "3D" : "2D"}
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

      <div style={rowStyle}>
        <span style={{ width: 60 }}>Opacity</span>
        <Slider
          min={0.1}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(value) => setTrackSettings({ opacity: value })}
          style={{ flex: 1, minWidth: 0 }}
        />
      </div>

      <div style={rowStyle}>
        <span style={{ width: 60 }}>Width</span>
        <Slider
          min={1}
          max={8}
          step={1}
          value={lineWidth}
          onChange={(value) => setTrackSettings({ lineWidth: value })}
          style={{ flex: 1, minWidth: 0 }}
        />
      </div>

      <h3 style={sectionTitleStyle}>Inspect a track</h3>
      <div style={rowStyle}>
        <Select
          size="small"
          showSearch
          allowClear
          placeholder="Select a track…"
          options={trackOptions}
          value={selectedTrackId ?? undefined}
          onChange={(value) => setSelectedTrackId(typeof value === "number" ? value : null)}
          filterOption={(input, option) => String(option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
          style={{ flex: 1, minWidth: 0 }}
        />
        {selectedTrackId !== null && (
          <Button size="small" onClick={() => setSelectedTrackId(null)}>
            Clear
          </Button>
        )}
      </div>

      {stats && (
        <div style={{ marginTop: 4 }}>
          <div style={statRowStyle}>
            <span>Frames</span>
            <span>
              {stats.startFrame} → {stats.endFrame}
            </span>
          </div>
          <div style={statRowStyle}>
            <span>Duration</span>
            <span>{stats.duration} frames</span>
          </div>
          <div style={statRowStyle}>
            <span>Detections</span>
            <span>
              {stats.pointCount}
              {stats.pointCount < stats.duration ? " (gaps)" : ""}
            </span>
          </div>
          <div style={statRowStyle}>
            <span>Path length</span>
            <span>{fmt(stats.pathLength)} vx</span>
          </div>
          <div style={statRowStyle}>
            <span>Mean speed</span>
            <span>{fmt(stats.meanSpeed)} vx/frame</span>
          </div>
          <div style={statRowStyle}>
            <span>Max step</span>
            <span>{fmt(stats.maxStep)} vx</span>
          </div>
          <div style={statRowStyle}>
            <span>Straightness</span>
            <span>{fmt(stats.straightness)}</span>
          </div>
          <p style={{ marginTop: 8, color: "var(--color-text-body)" }}>
            <i>Distances are in voxels.</i>
          </p>
        </div>
      )}
    </div>
  );
};

export default TracksPanel;
