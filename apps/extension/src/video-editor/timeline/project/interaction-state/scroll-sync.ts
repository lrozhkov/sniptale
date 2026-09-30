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
  const mirroredTopRef = useRef<{ tracks: number | null; timeline: number | null }>({
    tracks: null,
    timeline: null,
  });

  const syncTracksScroll = (source: 'tracks' | 'timeline') => {
    const tracks = trackListRef.current;
    const timeline = timelineRef.current;
    if (!tracks || !timeline) return;
    const origin = source === 'tracks' ? tracks : timeline;
    const mirror = source === 'tracks' ? timeline : tracks;
    const mirrorKey = source === 'tracks' ? 'timeline' : 'tracks';
    const acknowledgedTop = mirroredTopRef.current[source];
    mirroredTopRef.current[source] = null;
    if (acknowledgedTop === origin.scrollTop) return;
    if (mirror.scrollTop === origin.scrollTop) return;
    mirror.scrollTop = origin.scrollTop;
    mirroredTopRef.current[mirrorKey] = mirror.scrollTop;
  };

  return { timelineRef, trackListRef, syncTracksScroll };
}
