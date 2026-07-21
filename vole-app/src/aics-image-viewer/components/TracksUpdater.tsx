import type { View3d, Volume } from "@aics/vole-core";
import type React from "react";
import { useEffect, useRef } from "react";

import { select, useViewerState } from "../state/store";
import { TracksOverlay } from "../shared/utils/tracksOverlay";

/**
 * Number of trailing frames of each track to show. `Infinity` draws the whole trajectory up to the current frame
 * (a growing track); a finite value gives napari's fading "tail". Will become a user control in a later step.
 */
const TRACK_TAIL_LENGTH = Infinity;

interface TracksUpdaterProps {
  view3d: View3d;
  image: Volume | null;
}

/**
 * Renders nothing, but keeps the tracking overlay ({@link TracksOverlay}) in sync with the store: it (re)builds the
 * overlay whenever the tracking data or the volume changes, and advances the tail as the time slider moves.
 */
const TracksUpdater: React.FC<TracksUpdaterProps> = ({ view3d, image }) => {
  const tracking = useViewerState(select("tracking"));
  const time = useViewerState(select("time"));
  const overlayRef = useRef<TracksOverlay | null>(null);

  // (Re)build the overlay when the tracking data or the volume it maps onto changes.
  useEffect(() => {
    overlayRef.current?.dispose(view3d);
    overlayRef.current = null;

    if (tracking && image) {
      const overlay = new TracksOverlay(tracking, image);
      overlay.addTo(view3d);
      overlay.setTime(useViewerState.getState().time, TRACK_TAIL_LENGTH);
      overlayRef.current = overlay;
    }

    return () => {
      overlayRef.current?.dispose(view3d);
      overlayRef.current = null;
    };
  }, [tracking, image, view3d]);

  // Advance the tail as time changes (no rebuild).
  useEffect(() => {
    overlayRef.current?.setTime(time, TRACK_TAIL_LENGTH);
  }, [time]);

  return null;
};

export default TracksUpdater;
