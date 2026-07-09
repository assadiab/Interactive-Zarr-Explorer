import React, { useMemo } from "react";

import { useViewerState } from "../state/store";

/**
 * Manual per-object annotation, inspired by Allen's timelapse-colorizer
 * Annotation tab and adapted to this app's single-frame, label_id-keyed table.
 * Create named/colored labels, select objects (in the scatter or 3D), tag them
 * with a label, and export every object's label membership as one CSV.
 */

const LABEL_PALETTE = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

export default function AnnotationPanel(): React.ReactElement {
  const measurements = useViewerState((s) => s.measurements);
  const selectedIds = useViewerState((s) => s.selectedIds);
  const labels = useViewerState((s) => s.labels);
  const addLabel = useViewerState((s) => s.addLabel);
  const removeLabel = useViewerState((s) => s.removeLabel);
  const renameLabel = useViewerState((s) => s.renameLabel);
  const addIdsToLabel = useViewerState((s) => s.addIdsToLabel);
  const removeIdsFromLabel = useViewerState((s) => s.removeIdsFromLabel);
  const clearLabels = useViewerState((s) => s.clearLabels);
  const setSelectedIds = useViewerState((s) => s.setSelectedIds);

  const featureNames = useMemo(() => (measurements ? Object.keys(measurements.features) : []), [measurements]);

  const newLabel = (): void => {
    addLabel({
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `l${Date.now()}`,
      name: `Label ${labels.length + 1}`,
      color: LABEL_PALETTE[labels.length % LABEL_PALETTE.length],
      ids: new Set<number>(),
    });
  };

  const download = (csv: string, filename: string): void => {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  // All objects + one 0/1 membership column per label, in a single CSV.
  const exportAll = (): void => {
    if (!measurements) return;
    const cols = ["label_id", ...featureNames, ...labels.map((l) => l.name)];
    const lines = [cols.join(",")];
    measurements.labelIds.forEach((id, row) => {
      const labelCols = labels.map((l) => (l.ids.has(id) ? 1 : 0));
      lines.push([id, ...featureNames.map((f) => measurements.features[f][row]), ...labelCols].join(","));
    });
    download(lines.join("\n"), "annotations.csv");
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
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
        <button onClick={newLabel}>＋ New label</button>
        <span style={{ fontSize: 11, opacity: 0.65 }}>select objects in the scatter, then ＋ on a label</span>
      </div>

      {labels.length === 0 ? (
        <div style={{ opacity: 0.6, fontSize: 13 }}>No labels yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {labels.map((l) => (
            <div key={l.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <span style={{ width: 12, height: 12, background: l.color, borderRadius: 2, flexShrink: 0 }} />
              <input
                value={l.name}
                onChange={(e) => renameLabel(l.id, e.target.value)}
                style={{ width: 90, fontSize: 12 }}
              />
              <span style={{ opacity: 0.6 }}>{l.ids.size} obj</span>
              <span style={{ flex: 1 }} />
              <button title="Tag selection" disabled={nSel === 0} onClick={() => addIdsToLabel(l.id, selectedIds)}>
                ＋
              </button>
              <button
                title="Untag selection"
                disabled={nSel === 0}
                onClick={() => removeIdsFromLabel(l.id, selectedIds)}
              >
                −
              </button>
              <button title="Select members" onClick={() => setSelectedIds(l.ids)} style={{ fontSize: 11 }}>
                ◎
              </button>
              <button
                title="Export this label"
                onClick={() => download(buildRowsCsv(l.ids), `${l.name.replace(/\s+/g, "_")}.csv`)}
                style={{ fontSize: 11 }}
              >
                ⬇
              </button>
              <button title="Delete label" onClick={() => removeLabel(l.id)} style={{ fontSize: 11 }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 12 }}>
        <span>
          {labels.length} labels · {nSel} selected
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={clearLabels} disabled={labels.length === 0}>
          Clear labels
        </button>
        <button onClick={exportAll} disabled={labels.length === 0}>
          Export CSV
        </button>
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
