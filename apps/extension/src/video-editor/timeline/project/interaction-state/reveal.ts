import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { VideoProjectClip } from '../../../../features/video/project/types';
import type { TimelineClipRevealRequest } from '../types';

/** A reveal is a view command; it never changes zoom, selection or the receiving track. */
export function useTimelineClipReveal(params: {
  request: TimelineClipRevealRequest | undefined;
  clips: readonly Pick<VideoProjectClip, 'id' | 'startTime' | 'duration'>[];
  pixelsPerSecond: number;
  viewportWidth: number;
  navigateTo: (startTime: number) => void;
  timelineRef: RefObject<HTMLDivElement | null>;
  trackListRef: RefObject<HTMLDivElement | null>;
}) {
  const latest = useRef(params);
  latest.current = params;
  useLayoutEffect(() => {
    const model = latest.current;
    const request = model.request;
    const clip = request && model.clips.find(({ id }) => id === request.clipId);
    if (!clip) return;
    model.navigateTo(
      clip.startTime + clip.duration / 2 - model.viewportWidth / model.pixelsPerSecond / 2
    );
    // Horizontal navigation materializes clips outside the previous virtual window.
    const frame = requestAnimationFrame(() => {
      const timeline = model.timelineRef.current;
      const trackList = model.trackListRef.current;
      const element = timeline?.querySelector<HTMLElement>(
        `[data-project-timeline-clip="${CSS.escape(clip.id)}"]`
      );
      if (!timeline || !trackList || !element) return;
      const rect = element.getBoundingClientRect();
      const viewport = timeline.getBoundingClientRect();
      timeline.scrollTop += rect.top - viewport.top + rect.height / 2 - timeline.clientHeight / 2;
      trackList.scrollTop = timeline.scrollTop;
    });
    return () => cancelAnimationFrame(frame);
  }, [params.request]);
}
