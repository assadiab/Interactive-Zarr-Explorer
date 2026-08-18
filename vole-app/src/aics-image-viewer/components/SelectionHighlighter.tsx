import type { View3d, Volume } from "@aics/vole-core";
import type React from "react";
import { useEffect, useMemo } from "react";
import { Color } from "three";

import { buildSelectionColorize } from "../shared/utils/colorizeSelection";
import { getLabelChannels } from "../shared/utils/labelChannels";
import { select, useViewerState } from "../state/store";

/** Selected objects are painted this colour, matching the scatter's red `selected.marker`. */
const HIGHLIGHT = new Color(1, 0, 0);

interface SelectionHighlighterProps {
  view3d: View3d;
  image: Volume | null;
}

/**
 * Renders nothing; paints the selected objects inside the 3D view.
 *
 * This closes the loop opened by {@link ObjectPicker}: a click selects an object, and the
 * object it selected becomes visible as such in the volume rather than only in the scatter.
 * It works in both directions for free — the selection lives in the store, so objects picked
 * from the scatter light up here too, without this component knowing where they came from.
 *
 * The engine paints through a `ColorizeFeature`, which maps a per-object value onto a colour
 * ramp; `buildSelectionColorize` fills in the smallest version of that structure that can say
 * "selected or not". Passing `null` clears the highlight, which is what an empty selection
 * must do — otherwise the last selection stays painted.
 */
const SelectionHighlighter: React.FC<SelectionHighlighterProps> = ({ view3d, image }) => {
  const selectedIds = useViewerState(select("selectedIds"));
  const measurements = useViewerState(select("measurements"));
  // The loaded label raster changes with the timepoint, and so can its largest id — see below.
  const time = useViewerState(select("time"));

  /** Largest label id in the measurement table, or 0 when there is no table. */
  const tableMaxLabelId = useMemo(
    () => (measurements ? measurements.labelIds.reduce((max, id) => (id > max ? id : max), 0) : 0),
    [measurements]
  );

  useEffect(() => {
    if (!image) {
      return;
    }
    const labelChannels = getLabelChannels(image);
    if (labelChannels.length === 0) {
      return;
    }
    const channelIndex = labelChannels[0].channelIndex;

    // The per-frame id lookup has to span every label id the raster can hold, not just the
    // selected ones — a lookup that stops short makes unselected objects read back as selected
    // (see `colorizeSelection`). Two sources bound it, and neither alone is enough: the table
    // covers every frame but only objects that were measured, while the channel's `rawMax` is
    // measured from the raster itself but only for the timepoint currently loaded. Hence both,
    // and hence `time` in the dependencies.
    const labelIdCeiling = Math.max(tableMaxLabelId, image.getChannel(channelIndex).rawMax);

    // `buildSelectionColorize` returns null for an empty selection, and null is exactly what
    // `setChannelColorizeFeature` wants in order to clear — so no branch is needed here.
    view3d.setChannelColorizeFeature(
      image,
      channelIndex,
      buildSelectionColorize(selectedIds, HIGHLIGHT, labelIdCeiling)
    );
  }, [view3d, image, selectedIds, tableMaxLabelId, time]);

  return null;
};

export default SelectionHighlighter;
