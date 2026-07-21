import type { StateCreator } from "zustand";

import type { TrackingData } from "../shared/utils/loadTracks";
import type { ViewerStore } from "./store";

/**
 * Per-object measurement table loaded from the OME-Zarr `tables/measurements`
 * group. `labelIds[i]` is the object id of row `i`; `features[name][i]` is that
 * object's value for feature `name`. `index` maps a label_id back to its row so
 * the views can look up an object in O(1) on a pick.
 */
export type MeasurementTable = {
  labelIds: number[];
  features: Record<string, number[]>;
  index: Map<number, number>;
};

/**
 * A named, colored rectangular gate on two features: an object belongs to the
 * gate iff `xFeature` is within `xRange` AND `yFeature` is within `yRange`.
 * Several gates can coexist; CSV export records membership per gate.
 */
export type Gate = {
  id: string;
  name: string;
  color: string;
  xFeature: string;
  xRange: [number, number];
  yFeature: string;
  yRange: [number, number];
};

/**
 * A manual annotation label: a named, colored category whose `ids` are the
 * object label_ids the user has tagged with it. Several labels can coexist (an
 * object may carry more than one); CSV export records membership per label.
 */
export type AnnotationLabel = {
  id: string;
  name: string;
  color: string;
  ids: Set<number>;
};

/** How the tracking overlay is drawn. Lives in the store so the panel and the 3D updater stay in sync. */
export type TrackDisplaySettings = {
  showTracks: boolean;
  showDetections: boolean;
  /** Frames of trailing trajectory to draw; `Infinity` draws the whole history up to the current frame. */
  tailLength: number;
};

export type SelectionState = {
  /** The measurement table for the current scene, or null until loaded. */
  measurements: MeasurementTable | null;
  /** Parsed tracking result (trajectories over time), or null when none is loaded. */
  tracking: TrackingData | null;
  /** Display options for the tracking overlay. */
  trackSettings: TrackDisplaySettings;
  /** Currently selected object label_ids (shared across scatter / 3D / slices). */
  selectedIds: Set<number>;
  /** Feature whose value colors the scatter points, or null for a flat color. */
  colorByFeature: string | null;
  /** Saved gates (named populations); kept until removed, exported together. */
  gates: Gate[];
  /** Manual annotation labels; each holds the object ids tagged with it. */
  labels: AnnotationLabel[];
};

export type SelectionActions = {
  setMeasurements: (table: MeasurementTable | null) => void;
  /** Set (or clear, with null) the tracking result to overlay on the volume. */
  setTracking: (tracking: TrackingData | null) => void;
  /** Update one or more tracking display options. */
  setTrackSettings: (settings: Partial<TrackDisplaySettings>) => void;
  setSelectedIds: (ids: Iterable<number>) => void;
  toggleId: (id: number) => void;
  clearSelection: () => void;
  setColorByFeature: (feature: string | null) => void;
  /** Append a new saved gate. */
  addGate: (gate: Gate) => void;
  removeGate: (id: string) => void;
  renameGate: (id: string, name: string) => void;
  clearGates: () => void;
  /** Append a new annotation label. */
  addLabel: (label: AnnotationLabel) => void;
  removeLabel: (id: string) => void;
  renameLabel: (id: string, name: string) => void;
  /** Tag the given object ids with a label (add to its membership). */
  addIdsToLabel: (id: string, ids: Iterable<number>) => void;
  /** Untag the given object ids from a label. */
  removeIdsFromLabel: (id: string, ids: Iterable<number>) => void;
  clearLabels: () => void;
};

export type SelectionSlice = SelectionState & SelectionActions;

const defaultSelectionState: SelectionState = {
  measurements: null,
  tracking: null,
  trackSettings: { showTracks: true, showDetections: true, tailLength: Infinity },
  selectedIds: new Set<number>(),
  colorByFeature: null,
  gates: [],
  labels: [],
};

export const createSelectionSlice: StateCreator<ViewerStore, [], [], SelectionSlice> = (set) => ({
  ...defaultSelectionState,

  setMeasurements: (table) =>
    // New table => previous selection / gates / labels no longer apply.
    set({ measurements: table, selectedIds: new Set<number>(), gates: [], labels: [], colorByFeature: null }),

  setTracking: (tracking) => set({ tracking }),

  setTrackSettings: (settings) => set(({ trackSettings }) => ({ trackSettings: { ...trackSettings, ...settings } })),

  setSelectedIds: (ids) => set({ selectedIds: new Set<number>(ids) }),

  toggleId: (id) =>
    set(({ selectedIds }) => {
      const next = new Set(selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedIds: next };
    }),

  clearSelection: () => set({ selectedIds: new Set<number>() }),

  setColorByFeature: (feature) => set({ colorByFeature: feature }),

  addGate: (gate) => set(({ gates }) => ({ gates: [...gates, gate] })),

  removeGate: (id) => set(({ gates }) => ({ gates: gates.filter((g) => g.id !== id) })),

  renameGate: (id, name) =>
    set(({ gates }) => ({ gates: gates.map((g) => (g.id === id ? { ...g, name } : g)) })),

  clearGates: () => set({ gates: [] }),

  addLabel: (label) => set(({ labels }) => ({ labels: [...labels, label] })),

  removeLabel: (id) => set(({ labels }) => ({ labels: labels.filter((l) => l.id !== id) })),

  renameLabel: (id, name) =>
    set(({ labels }) => ({ labels: labels.map((l) => (l.id === id ? { ...l, name } : l)) })),

  addIdsToLabel: (id, ids) =>
    set(({ labels }) => ({
      labels: labels.map((l) => (l.id === id ? { ...l, ids: new Set([...l.ids, ...ids]) } : l)),
    })),

  removeIdsFromLabel: (id, ids) =>
    set(({ labels }) => {
      const drop = new Set(ids);
      return {
        labels: labels.map((l) =>
          l.id === id ? { ...l, ids: new Set([...l.ids].filter((v) => !drop.has(v))) } : l
        ),
      };
    }),

  clearLabels: () => set({ labels: [] }),
});

/**
 * The set of label_ids inside a gate (both features within their ranges). Used
 * by the scatter (which points belong to a gate) and CSV export (membership).
 */
export function idsInGate(measurements: MeasurementTable | null, gate: Gate): Set<number> {
  const inside = new Set<number>();
  if (!measurements) {
    return inside;
  }
  const xs = measurements.features[gate.xFeature];
  const ys = measurements.features[gate.yFeature];
  if (!xs || !ys) {
    return inside;
  }
  const [x0, x1] = gate.xRange;
  const [y0, y1] = gate.yRange;
  for (let row = 0; row < measurements.labelIds.length; row++) {
    const xv = xs[row];
    const yv = ys[row];
    if (xv >= x0 && xv <= x1 && yv >= y0 && yv <= y1) {
      inside.add(measurements.labelIds[row]);
    }
  }
  return inside;
}
