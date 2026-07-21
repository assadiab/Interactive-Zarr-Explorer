import type { View3d, Volume } from "@aics/vole-core";
import type React from "react";
import { useEffect } from "react";

import { getLabelChannels } from "../shared/utils/labelChannels";
import { makeObjectKey } from "../shared/utils/objectKey";
import { select, useViewerState } from "../state/store";

/**
 * Pointer movement (in px) below which a mouse-up still counts as a click. Without this, releasing the button after
 * rotating the camera would select whatever object happens to be under the cursor.
 */
const CLICK_SLOP_PX = 4;

interface ObjectPickerProps {
  view3d: View3d;
  image: Volume | null;
}

/**
 * Renders nothing; turns a click in the 3D view into a selection (the 3D → scatter half of the bidirectional link).
 *
 * `hitTest` returns the raw pixel value of the pickable channel, i.e. the segmentation label id under the cursor.
 * That id is only meaningful together with the current frame — label ids are numbered per timepoint — so the pair is
 * packed into an {@link makeObjectKey} before it reaches the store. Value 0 is background and is ignored.
 */
const ObjectPicker: React.FC<ObjectPickerProps> = ({ view3d, image }) => {
  const toggleId = useViewerState(select("toggleId"));

  // Pick from the first label channel, when the image has one.
  useEffect(() => {
    if (!image) {
      return;
    }
    const labelChannels = getLabelChannels(image);
    if (labelChannels.length === 0) {
      view3d.enablePicking(image, false);
      return;
    }
    view3d.enablePicking(image, true, labelChannels[0].channelIndex);
    return () => view3d.enablePicking(image, false);
  }, [view3d, image]);

  useEffect(() => {
    if (!image || getLabelChannels(image).length === 0) {
      return;
    }
    const element = view3d.getDOMElement();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (event: PointerEvent): void => {
      downX = event.clientX;
      downY = event.clientY;
    };

    const onPointerUp = (event: PointerEvent): void => {
      // Ignore the mouse-up that ends a camera drag.
      if (Math.abs(event.clientX - downX) > CLICK_SLOP_PX || Math.abs(event.clientY - downY) > CLICK_SLOP_PX) {
        return;
      }
      const rect = element.getBoundingClientRect();
      const labelId = view3d.hitTest(event.clientX - rect.left, event.clientY - rect.top);
      if (labelId <= 0) {
        return; // -1 = nothing hit, 0 = background
      }
      toggleId(makeObjectKey(useViewerState.getState().time, labelId));
    };

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointerup", onPointerUp);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointerup", onPointerUp);
    };
  }, [view3d, image, toggleId]);

  return null;
};

export default ObjectPicker;
