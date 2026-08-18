import Plotly from "plotly.js-dist-min";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { type Gate, idsInGate } from "../state/selection";
import { useViewerState } from "../state/store";
import { makeObjectKey, type ObjectKey } from "../shared/utils/objectKey";

/**
 * Interactive feature scatter for the per-object measurement table, rendered
 * with Plotly. Box-selecting a region and clicking "Save as gate" stores it as
 * a named, colored rectangular gate; several gates coexist and are exported
 * together (one membership column each) or one at a time.
 *
 * Interactions:
 *  - click a point   -> toggle it in the selection (highlighted red)
 *  - box-select drag -> select points inside + arm "Save as gate"
 *  - X / Y / Color    -> plotted / color-by features
 *  - Save as gate     -> turn the last box selection into a saved gate
 */

const PLOT_CONFIG: Partial<Plotly.Config> = {
  responsive: true,
  displaylogo: false,
  scrollZoom: true,
  modeBarButtonsToRemove: ["lasso2d", "autoScale2d"],
};

const POINT_COLOR = "#3b82f6";
const SELECTED_COLOR = "#ff3b30";
const GATE_PALETTE = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

function extent(values: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (Number.isFinite(v)) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo)) return [0, 1];
  if (lo === hi) return [lo - 0.5, hi + 0.5];
  return [lo, hi];
}

const hexToRgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

type Range = { x: [number, number]; y: [number, number] };

/** Plotly's dist-min types omit the (supported) selection styling props. */
type SelectablePlotData = Partial<Plotly.PlotData> & {
  selectedpoints?: number[];
  selected?: { marker?: Partial<Plotly.PlotMarker> };
  unselected?: { marker?: Partial<Plotly.PlotMarker> };
};

export default function ScatterPanel(): React.ReactElement {
  const measurements = useViewerState((s) => s.measurements);
  const selectedIds = useViewerState((s) => s.selectedIds);
  const gates = useViewerState((s) => s.gates);
  const colorByFeature = useViewerState((s) => s.colorByFeature);
  const setSelectedIds = useViewerState((s) => s.setSelectedIds);
  const toggleId = useViewerState((s) => s.toggleId);
  const clearSelection = useViewerState((s) => s.clearSelection);
  const addGate = useViewerState((s) => s.addGate);
  const removeGate = useViewerState((s) => s.removeGate);
  const renameGate = useViewerState((s) => s.renameGate);
  const clearGates = useViewerState((s) => s.clearGates);
  const setColorByFeature = useViewerState((s) => s.setColorByFeature);

  const featureNames = useMemo(() => (measurements ? Object.keys(measurements.features) : []), [measurements]);

  const [xFeat, setXFeat] = useState<string | null>(null);
  const [yFeat, setYFeat] = useState<string | null>(null);
  const [pendingRange, setPendingRange] = useState<Range | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);

  // default axes when a table loads
  useEffect(() => {
    if (featureNames.length) {
      setXFeat((f) => (f && featureNames.includes(f) ? f : featureNames[0]));
      setYFeat((f) => (f && featureNames.includes(f) ? f : featureNames[1] ?? featureNames[0]));
    }
  }, [featureNames]);

  // A box selection only makes sense for the axes it was drawn on.
  useEffect(() => setPendingRange(null), [xFeat, yFeat]);

  // Membership set per gate (for counts, point coloring and export).
  const gateIdSets = useMemo(() => gates.map((g) => idsInGate(measurements, g)), [measurements, gates]);

  // Build and (re)draw the Plotly figure whenever inputs change.
  useEffect(() => {
    const div = plotRef.current;
    if (!div || !measurements || !xFeat || !yFeat) {
      return;
    }
    const xs = measurements.features[xFeat] ?? [];
    const ys = measurements.features[yFeat] ?? [];
    const ids = measurements.labelIds;
    // Points carry the composite (frame, label_id) key: a bare label id is ambiguous across timepoints, so click and
    // box-select would otherwise select unrelated objects in other frames.
    const objectKeys = ids.map((id, row) => makeObjectKey(measurements.frames ? measurements.frames[row] : 0, id));
    const colorVals = colorByFeature ? measurements.features[colorByFeature] : null;

    // Per-point base color: color-by-feature gradient, else the color of the
    // first gate the point belongs to, else the default blue. (Selected points
    // are recolored red by Plotly's `selected.marker` below.)
    const idToGateColor = new Map<number, string>();
    gates.forEach((g, gi) => gateIdSets[gi].forEach((id) => idToGateColor.has(id) || idToGateColor.set(id, g.color)));

    // Selected rows, as point indices into the trace, drive Plotly's native
    // selection styling so a box-select / click highlights immediately.
    const selectedPoints: number[] = [];
    selectedIds.forEach((id) => {
      const row = measurements.index.get(id);
      if (row !== undefined) selectedPoints.push(row);
    });

    const trace: SelectablePlotData = {
      // SVG scatter (not scattergl): reliable box-select `range` and event
      // behavior for the small per-object tables we plot.
      type: "scatter",
      mode: "markers",
      x: xs,
      y: ys,
      customdata: objectKeys,
      hovertemplate: `id %{customdata}<br>${xFeat}=%{x:.4g}<br>${yFeat}=%{y:.4g}<extra></extra>`,
      marker: {
        size: 7,
        color: colorVals ? colorVals : ids.map((id) => idToGateColor.get(id) ?? POINT_COLOR),
        colorscale: colorVals ? "Viridis" : undefined,
        showscale: false,
        ...(colorVals ? { cmin: extent(colorVals)[0], cmax: extent(colorVals)[1] } : {}),
      },
      selectedpoints: selectedIds.size ? selectedPoints : undefined,
      selected: { marker: { color: SELECTED_COLOR, size: 10 } },
      unselected: { marker: { opacity: 0.35 } },
    };

    const traces: Partial<Plotly.PlotData>[] = [trace];

    // Draw saved gates whose features match the current axes as rectangles.
    const shapes: Partial<Plotly.Shape>[] = [];
    const annotations: Partial<Plotly.Annotations>[] = [];
    gates.forEach((g) => {
      if (g.xFeature !== xFeat || g.yFeature !== yFeat) return;
      shapes.push({
        type: "rect",
        xref: "x",
        yref: "y",
        x0: g.xRange[0],
        x1: g.xRange[1],
        y0: g.yRange[0],
        y1: g.yRange[1],
        line: { color: g.color, width: 1.5 },
        fillcolor: hexToRgba(g.color, 0.08),
        layer: "below",
      });
      annotations.push({
        xref: "x",
        yref: "y",
        x: g.xRange[0],
        y: g.yRange[1],
        text: g.name,
        showarrow: false,
        font: { color: g.color, size: 10 },
        xanchor: "left",
        yanchor: "bottom",
        bgcolor: "rgba(255,255,255,0.7)",
      });
    });

    // The current (unsaved) box selection, drawn dashed so it persists after the
    // drag ends — Plotly would otherwise clear its own outline on re-render.
    if (pendingRange) {
      shapes.push({
        type: "rect",
        xref: "x",
        yref: "y",
        x0: Math.min(...pendingRange.x),
        x1: Math.max(...pendingRange.x),
        y0: Math.min(...pendingRange.y),
        y1: Math.max(...pendingRange.y),
        line: { color: "#111", width: 1, dash: "dot" },
        fillcolor: "rgba(0,0,0,0.03)",
        layer: "above",
      });
    }

    const layout: Partial<Plotly.Layout> = {
      margin: { l: 48, r: 10, t: 8, b: 40 },
      dragmode: "select",
      showlegend: false,
      height: 340,
      hovermode: "closest",
      // Preserve the user's zoom and box-selection across re-renders.
      uirevision: "scatter",
      xaxis: { title: { text: xFeat }, automargin: true },
      yaxis: { title: { text: yFeat }, automargin: true },
      shapes,
      annotations,
    };

    Plotly.react(div, traces, layout, PLOT_CONFIG);

    // (Re)bind interaction handlers; clear previous bindings so they don't stack.
    const gd = div as unknown as Plotly.PlotlyHTMLElement;
    gd.removeAllListeners?.("plotly_click");
    gd.removeAllListeners?.("plotly_selected");
    gd.on("plotly_click", (e) => {
      const key = e.points?.[0]?.customdata as ObjectKey | undefined;
      if (typeof key === "number") {
        toggleId(key);
      }
    });
    gd.on("plotly_selected", (e) => {
      if (!e || !e.points) {
        return;
      }
      const picked = e.points.map((p) => p.customdata as ObjectKey).filter((v) => typeof v === "number");
      setSelectedIds(picked);
      // Box-select reports the drawn rectangle in data coords; arm "Save as gate".
      const range = e.range as { x?: [number, number]; y?: [number, number] } | undefined;
      if (range?.x && range?.y) {
        setPendingRange({ x: [...range.x] as [number, number], y: [...range.y] as [number, number] });
      }
    });

    const observer = new ResizeObserver(() => Plotly.Plots.resize(div));
    observer.observe(div);
    return () => observer.disconnect();
  }, [measurements, xFeat, yFeat, colorByFeature, selectedIds, gates, gateIdSets, pendingRange, setSelectedIds, toggleId]);

  // Tear down Plotly on unmount.
  useEffect(() => {
    const div = plotRef.current;
    return () => {
      if (div) {
        Plotly.purge(div);
      }
    };
  }, []);

  const saveGate = (): void => {
    if (!pendingRange || !xFeat || !yFeat) return;
    const [x0, x1] = pendingRange.x;
    const [y0, y1] = pendingRange.y;
    addGate({
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `g${Date.now()}`,
      name: `Gate ${gates.length + 1}`,
      color: GATE_PALETTE[gates.length % GATE_PALETTE.length],
      xFeature: xFeat,
      xRange: [Math.min(x0, x1), Math.max(x0, x1)],
      yFeature: yFeat,
      yRange: [Math.min(y0, y1), Math.max(y0, y1)],
    });
    setPendingRange(null);
  };

  /** Build a CSV of `ids` (in table order) with label_id + all feature columns. */
  const buildRowsCsv = (ids: Set<number>): string => {
    if (!measurements) return "";
    const cols = ["label_id", ...featureNames];
    const lines = [cols.join(",")];
    measurements.labelIds.forEach((id, row) => {
      if (!ids.has(id)) return;
      lines.push([id, ...featureNames.map((f) => measurements.features[f][row])].join(","));
    });
    return lines.join("\n");
  };

  const download = (csv: string, filename: string): void => {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export ALL objects with one membership column (0/1) per gate, in one CSV.
  const exportAll = (): void => {
    if (!measurements) return;
    const cols = ["frame", "label_id", ...featureNames, ...gates.map((g) => g.name)];
    const lines = [cols.join(",")];
    measurements.labelIds.forEach((id, row) => {
      const frame = measurements.frames ? measurements.frames[row] : 0;
      const key = makeObjectKey(frame, id);
      const gateCols = gateIdSets.map((set) => (set.has(key) ? 1 : 0));
      lines.push([frame, id, ...featureNames.map((f) => measurements.features[f][row]), ...gateCols].join(","));
    });
    download(lines.join("\n"), "features_with_gates.csv");
  };

  if (!measurements) {
    return (
      <div style={panelStyle}>
        <div style={{ opacity: 0.6, fontSize: 13 }}>No measurement table loaded for this scene.</div>
      </div>
    );
  }

  const nSel = selectedIds.size;

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
        <label>
          X:{" "}
          <select value={xFeat ?? ""} onChange={(e) => setXFeat(e.target.value)}>
            {featureNames.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label>
          Y:{" "}
          <select value={yFeat ?? ""} onChange={(e) => setYFeat(e.target.value)}>
            {featureNames.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label>
          Color:{" "}
          <select value={colorByFeature ?? ""} onChange={(e) => setColorByFeature(e.target.value || null)}>
            <option value="">(none)</option>
            {featureNames.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div ref={plotRef} style={{ width: "100%" }} />

      {/* Gate creation + list */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
        <button onClick={saveGate} disabled={!pendingRange}>
          ＋ Save as gate
        </button>
        <span style={{ fontSize: 11, opacity: 0.65 }}>
          {pendingRange ? "selection ready — name it after saving" : "box-select a region first"}
        </span>
      </div>

      {gates.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          {gates.map((g, gi) => (
            <div key={g.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <span style={{ width: 12, height: 12, background: g.color, borderRadius: 2, flexShrink: 0 }} />
              <input
                value={g.name}
                onChange={(e) => renameGate(g.id, e.target.value)}
                style={{ width: 90, fontSize: 12 }}
              />
              <span style={{ opacity: 0.6 }}>{gateIdSets[gi].size} obj</span>
              <span style={{ fontSize: 11, opacity: 0.55 }}>
                {g.xFeature} × {g.yFeature}
              </span>
              <span style={{ flex: 1 }} />
              <button title="Select members" onClick={() => setSelectedIds(gateIdSets[gi])} style={{ fontSize: 11 }}>
                ◎
              </button>
              <button
                title="Export this gate"
                onClick={() => download(buildRowsCsv(gateIdSets[gi]), `${g.name.replace(/\s+/g, "_")}.csv`)}
                style={{ fontSize: 11 }}
              >
                ⬇
              </button>
              <button title="Delete gate" onClick={() => removeGate(g.id)} style={{ fontSize: 11 }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 12 }}>
        <span>
          {measurements.labelIds.length} objects · {gates.length} gates · {nSel} selected
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => {
            clearSelection();
            setPendingRange(null);
          }}
          disabled={nSel === 0 && !pendingRange}
        >
          Clear selection
        </button>
        <button onClick={clearGates} disabled={gates.length === 0}>
          Clear gates
        </button>
        <button onClick={exportAll}>Export CSV</button>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  padding: 10,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  fontFamily: "system-ui, sans-serif",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};
