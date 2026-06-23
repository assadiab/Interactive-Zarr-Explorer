import { Button, Select } from "antd";
import Plotly from "plotly.js-dist-min";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { computeCorrelations } from "../shared/utils/correlation";
import { useViewerState } from "../state/store";

/**
 * Feature-by-feature Pearson correlation heatmap for the per-object measurement
 * table, rendered with Plotly. Reproduces the Correlation tab of Allen's
 * timelapse-colorizer: a multi-select chooses which features go into the matrix
 * (all by default), and the heatmap recomputes on the chosen subset.
 *
 * Plotly is driven imperatively (`Plotly.react` on a ref'd div), the same way
 * the colorizer drives its plots.
 */

const PLOT_CONFIG: Partial<Plotly.Config> = { displayModeBar: false, responsive: true };

// Diverging ramp: cool (anti-correlated) -> light (uncorrelated) -> warm
// (correlated). Kept light enough that the dark in-cell value text stays legible.
const COLORSCALE: Array<[number, string]> = [
  [0, "steelblue"],
  [0.5, "white"],
  [1, "tomato"],
];

const HELP_COLOR = "#ccc";

export default function CorrelationPanel(): React.ReactElement {
  const measurements = useViewerState((s) => s.measurements);
  const plotRef = useRef<HTMLDivElement | null>(null);

  const allFeatureNames = useMemo(
    () => (measurements ? Object.keys(measurements.features) : []),
    [measurements]
  );

  // Which features are shown; defaults to all whenever the table changes.
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    setSelected(allFeatureNames);
  }, [allFeatureNames]);

  // Correlation matrix over the selected feature columns.
  const matrix = useMemo(() => {
    if (!measurements || selected.length < 2) {
      return [] as number[][];
    }
    const columns = selected.map((name) => Float32Array.from(measurements.features[name]));
    return computeCorrelations(columns);
  }, [measurements, selected]);

  // Draw / redraw the heatmap when the matrix changes.
  useEffect(() => {
    const div = plotRef.current;
    if (!div || selected.length < 2) {
      return;
    }

    const trace: Partial<Plotly.PlotData> = {
      type: "heatmap",
      z: matrix,
      x: selected,
      y: selected,
      zmin: -1,
      zmax: 1,
      colorscale: COLORSCALE,
      texttemplate: "%{z:.2f}",
      // No explicit color: Plotly auto-picks a per-cell contrasting text color.
      textfont: { size: 9 },
      hovertemplate: "%{y}  vs  %{x}<br>r = %{z:.3f}<extra></extra>",
      colorbar: { thickness: 10, tickfont: { color: HELP_COLOR, size: 9 }, outlinewidth: 0 },
    };

    const layout: Partial<Plotly.Layout> = {
      margin: { l: 90, r: 10, t: 10, b: 90 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: HELP_COLOR, size: 10 },
      xaxis: { tickangle: -45, automargin: true, ticks: "" },
      yaxis: { autorange: "reversed", automargin: true, ticks: "" },
      height: 420,
    };

    Plotly.react(div, [trace], layout, PLOT_CONFIG);

    // Keep the plot sized to its container (the control panel can resize).
    const observer = new ResizeObserver(() => Plotly.Plots.resize(div));
    observer.observe(div);
    return () => observer.disconnect();
  }, [matrix, selected]);

  // Tear down Plotly's internals on unmount to avoid leaks.
  useEffect(() => {
    const div = plotRef.current;
    return () => {
      if (div) {
        Plotly.purge(div);
      }
    };
  }, []);

  if (!measurements) {
    return <div style={{ opacity: 0.6, fontSize: 13, padding: 10, color: HELP_COLOR }}>No measurement table loaded for this scene.</div>;
  }

  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <Select
          mode="multiple"
          allowClear
          size="small"
          placeholder="Select features"
          style={{ flex: 1 }}
          value={selected}
          maxTagCount="responsive"
          options={allFeatureNames.map((name) => ({ label: name, value: name }))}
          onChange={setSelected}
        />
        <Button size="small" onClick={() => setSelected(allFeatureNames)}>
          All
        </Button>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6, color: HELP_COLOR }}>
        Pearson correlation ({measurements.labelIds.length} objects). Warm = correlated, cool = anti-correlated.
      </div>

      {selected.length < 2 ? (
        <div style={{ opacity: 0.6, fontSize: 13, color: HELP_COLOR }}>Select at least two features.</div>
      ) : (
        <div ref={plotRef} style={{ width: "100%" }} />
      )}
    </div>
  );
}
