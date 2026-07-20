import { useLayoutEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { TimelineTrackLayoutModel } from '../tracks/layout';
import { syncTimelineTrackScrollIntoView } from './scroll-sync';

export function useTimelineSelectedTrackAutoScroll(params: {
  selectedTrackId: string | null;
  timelineRef: MutableRefObject<HTMLDivElement | null>;
  trackLayoutModel: TimelineTrackLayoutModel;
  trackListRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const lastAutoScrolledTrackIdRef = useRef<string | null>(params.selectedTrackId);

  useLayoutEffect(() => {
    const selectedTrackId = params.selectedTrackId;

    if (!selectedTrackId) {
      lastAutoScrolledTrackIdRef.current = null;
      return;
    }

    if (lastAutoScrolledTrackIdRef.current === selectedTrackId) {
      return;
    }

    const selectedTrackLayout = params.trackLayoutModel.layoutByTrackId.get(selectedTrackId);
    const timeline = params.timelineRef.current;
    const trackList = params.trackListRef.current;
    if (!selectedTrackLayout || !timeline || !trackList) {
      return;
    }

    syncTimelineTrackScrollIntoView({
      timeline,
      trackHeight: selectedTrackLayout.rowHeight,
      trackList,
      trackTop: selectedTrackLayout.top,
    });
    lastAutoScrolledTrackIdRef.current = selectedTrackId;
  }, [params.selectedTrackId, params.timelineRef, params.trackLayoutModel, params.trackListRef]);
}
