import { useRef } from 'react';

export function resolveTimelineTrackScrollTop(params: {
  currentScrollTop: number;
  trackHeight: number;
  trackTop: number;
  viewportHeight: number;
}) {
  const viewportBottom = params.currentScrollTop + params.viewportHeight;
  const trackBottom = params.trackTop + params.trackHeight;

  if (params.trackTop < params.currentScrollTop) {
    return Math.max(0, params.trackTop);
  }

  if (trackBottom > viewportBottom) {
    return Math.max(0, trackBottom - params.viewportHeight);
  }

  return params.currentScrollTop;
}

export function syncTimelineTrackScrollIntoView(params: {
  timeline: HTMLDivElement | null;
  trackHeight: number;
  trackList: HTMLDivElement | null;
  trackTop: number;
}) {
  if (!params.timeline || !params.trackList || params.trackList.clientHeight <= 0) {
    return false;
  }

  const nextScrollTop = resolveTimelineTrackScrollTop({
    currentScrollTop: params.trackList.scrollTop,
    trackHeight: params.trackHeight,
    trackTop: params.trackTop,
    viewportHeight: params.trackList.clientHeight,
  });
  const changed =
    params.trackList.scrollTop !== nextScrollTop || params.timeline.scrollTop !== nextScrollTop;

  params.trackList.scrollTop = nextScrollTop;
  params.timeline.scrollTop = nextScrollTop;
  return changed;
}

export function useProjectTimelineScrollSync() {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const trackListRef = useRef<HTMLDivElement | null>(null);
  const scrollSyncRef = useRef<'tracks' | 'timeline' | null>(null);

  const syncTracksScroll = (source: 'tracks' | 'timeline') => {
    if (scrollSyncRef.current && scrollSyncRef.current !== source) {
      return;
    }

    scrollSyncRef.current = source;
    if (source === 'tracks' && timelineRef.current && trackListRef.current) {
      timelineRef.current.scrollTop = trackListRef.current.scrollTop;
    }
    if (source === 'timeline' && timelineRef.current && trackListRef.current) {
      trackListRef.current.scrollTop = timelineRef.current.scrollTop;
    }
    requestAnimationFrame(() => {
      scrollSyncRef.current = null;
    });
  };

  return { timelineRef, trackListRef, syncTracksScroll };
}
