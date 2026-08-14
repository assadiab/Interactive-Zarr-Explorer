import { beforeEach, describe, expect, it } from "@jest/globals";

import { useViewerState } from "../store";

const openIds = (): string[] => useViewerState.getState().openDatasetIds;

describe("catalog slice", () => {
  beforeEach(() => {
    useViewerState.setState({ openDatasetIds: [], catalogDisplayMode: "parallel" });
  });

  it("opens datasets in the order they were opened", () => {
    const { openDataset } = useViewerState.getState();
    openDataset("raw");
    openDataset("decon");
    expect(openIds()).toEqual(["raw", "decon"]);
  });

  // Opening twice would load the same channels into the volume a second time — a copy of
  // what is already shown, at full texture cost.
  it("ignores a dataset that is already open", () => {
    const { openDataset } = useViewerState.getState();
    openDataset("raw");
    openDataset("raw");
    expect(openIds()).toEqual(["raw"]);
  });

  it("closes one dataset and leaves the others in order", () => {
    const { openDataset, closeDataset } = useViewerState.getState();
    openDataset("raw");
    openDataset("decon");
    openDataset("seg");
    closeDataset("decon");
    expect(openIds()).toEqual(["raw", "seg"]);
  });

  it("ignores closing a dataset that is not open", () => {
    const { openDataset, closeDataset } = useViewerState.getState();
    openDataset("raw");
    closeDataset("nope");
    expect(openIds()).toEqual(["raw"]);
  });

  it("replaces the whole open set when opening only one", () => {
    const { openDataset, openOnlyDataset } = useViewerState.getState();
    openDataset("raw");
    openDataset("decon");
    openOnlyDataset("seg");
    expect(openIds()).toEqual(["seg"]);
  });

  it("defaults to parallel and switches to overlay", () => {
    expect(useViewerState.getState().catalogDisplayMode).toBe("parallel");
    useViewerState.getState().setCatalogDisplayMode("overlay");
    expect(useViewerState.getState().catalogDisplayMode).toBe("overlay");
  });
});
