import type { StateCreator } from "zustand";

import type { CatalogDisplayMode } from "../shared/utils/cidCatalog";
import type { ViewerStore } from "./store";

/**
 * Which datasets of a {@link CidCatalog} are currently open, and how they are shown.
 *
 * Lives in the store rather than in the explorer component because it decides what the
 * viewer displays — the canvas, the scene picker and the analysis panels all follow from
 * it, so it is cross-panel state (CLAUDE.md §7). Only ids live here: the archives
 * themselves are fetched on demand and never held in the store.
 */
export type CatalogSlice = {
  /** Open datasets, in the order they were opened — that order drives channel and scene order. */
  openDatasetIds: string[];
  catalogDisplayMode: CatalogDisplayMode;
  /**
   * Whether the explorer drawer is showing. UI state, but kept here rather than in a
   * component because the button that opens it (the toolbar) and the drawer itself sit far
   * apart in the tree — the alternative is threading a callback through every layer between.
   */
  explorerOpen: boolean;
  setExplorerOpen: (open: boolean) => void;
  /** Adds a dataset to the open set. Opening an already-open dataset is a no-op. */
  openDataset: (id: string) => void;
  closeDataset: (id: string) => void;
  /** Replaces the open set with this single dataset (a plain click in the explorer). */
  openOnlyDataset: (id: string) => void;
  setCatalogDisplayMode: (mode: CatalogDisplayMode) => void;
};

export const createCatalogSlice: StateCreator<ViewerStore, [], [], CatalogSlice> = (set) => ({
  openDatasetIds: [],
  catalogDisplayMode: "parallel",
  explorerOpen: false,

  setExplorerOpen: (explorerOpen) => set({ explorerOpen }),

  // Guarding against duplicates matters: the same dataset twice would load its channels
  // twice into one volume, doubling texture memory for a copy of what is already shown.
  openDataset: (id) =>
    set(({ openDatasetIds }) =>
      openDatasetIds.includes(id) ? {} : { openDatasetIds: [...openDatasetIds, id] }
    ),

  closeDataset: (id) => set(({ openDatasetIds }) => ({ openDatasetIds: openDatasetIds.filter((o) => o !== id) })),

  openOnlyDataset: (id) => set({ openDatasetIds: [id] }),

  setCatalogDisplayMode: (mode) => set({ catalogDisplayMode: mode }),
});
