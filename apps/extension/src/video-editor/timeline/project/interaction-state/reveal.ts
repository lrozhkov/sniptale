import { useLayoutEffect, useRef, type RefObject } from 'react';
import { projectVideoProjectCommentAnchor } from '../../../../features/video/project/comments/projection';
import type { VideoEditorSelection } from '../../../contracts/selection';
import type { VideoProject, VideoProjectClip } from '../../../../features/video/project/types';
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

/** Reveal a new note selection once, without following later playback or editing renders. */
export function useTimelineNoteReveal(params: {
  selection: VideoEditorSelection;
  project: VideoProject;
  currentTime: number;
  pixelsPerSecond: number;
  viewportWidth: number;
  readStartTime(): number;
  navigateTo(startTime: number): void;
}) {
  const latest = useRef(params);
  latest.current = params;
  useLayoutEffect(() => {
    const model = latest.current;
    const selection = model.selection;
    if (selection.kind !== 'comment' || model.viewportWidth <= 0) return;
    const document = model.project.commentDocuments?.find(
      (item) => item.id === selection.documentId
    );
    const note = document?.annotations.find((item) => item.id === selection.commentId);
    if (!document || !note) return;
    const admitted = projectVideoProjectCommentAnchor(model.project, document, note.anchor).some(
      (span) => Math.abs(span.start - model.currentTime) <= 1e-7
    );
    if (!admitted) return;
    const x = (model.currentTime - model.readStartTime()) * model.pixelsPerSecond;
    if (x >= 8 && x <= model.viewportWidth - 8) return;
    model.navigateTo(model.currentTime - model.viewportWidth / model.pixelsPerSecond / 2);
  }, [params.selection]);
}
