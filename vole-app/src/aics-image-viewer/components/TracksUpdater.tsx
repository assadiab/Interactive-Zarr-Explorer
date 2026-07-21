import type { View3d, Volume } from "@aics/vole-core";
import type React from "react";
import { useEffect, useRef } from "react";

import { select, useViewerState } from "../state/store";
import { TracksOverlay } from "../shared/utils/tracksOverlay";

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
  const { showTracks, showDetections, tailLength } = useViewerState(select("trackSettings"));
  const overlayRef = useRef<TracksOverlay | null>(null);

  // (Re)build the overlay when the tracking data or the volume it maps onto changes.
  useEffect(() => {
    overlayRef.current?.dispose(view3d);
    overlayRef.current = null;

    if (tracking && image) {
      const overlay = new TracksOverlay(tracking, image);
      overlay.addTo(view3d);
      const { time: t, trackSettings } = useViewerState.getState();
      overlay.setVisible(trackSettings.showTracks, trackSettings.showDetections);
      overlay.setTime(t, trackSettings.tailLength);
      overlayRef.current = overlay;
    }

    return () => {
      overlayRef.current?.dispose(view3d);
      overlayRef.current = null;
    };
  }, [tracking, image, view3d]);

  // Advance the tail as time (or the tail length) changes — no rebuild needed.
  useEffect(() => {
    overlayRef.current?.setTime(time, tailLength);
  }, [time, tailLength]);

  // Toggle the two layers independently.
  useEffect(() => {
    overlayRef.current?.setVisible(showTracks, showDetections);
  }, [showTracks, showDetections]);

  return null;
};

export default TracksUpdater;
