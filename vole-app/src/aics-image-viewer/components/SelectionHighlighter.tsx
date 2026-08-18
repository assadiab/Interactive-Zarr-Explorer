import type { View3d, Volume } from "@aics/vole-core";
import type React from "react";
import { useEffect } from "react";
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

  useEffect(() => {
    if (!image) {
      return;
    }
    const labelChannels = getLabelChannels(image);
    if (labelChannels.length === 0) {
      return;
    }
    // `buildSelectionColorize` returns null for an empty selection, and null is exactly what
    // `setChannelColorizeFeature` wants in order to clear — so no branch is needed here.
    view3d.setChannelColorizeFeature(image, labelChannels[0].channelIndex, buildSelectionColorize(selectedIds, HIGHLIGHT));
  }, [view3d, image, selectedIds]);

  return null;
};

export default SelectionHighlighter;
