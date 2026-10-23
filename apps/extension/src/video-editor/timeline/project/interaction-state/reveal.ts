import { projectSourceVoiceoverViews } from '../../../../features/video/project/source-voiceover-views';
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { projectVideoProjectCommentAnchor } from '../../../../features/video/project/comments/projection';
import type { VideoEditorSelection } from '../../../contracts/selection';
import type { VideoProject } from '../../../../features/video/project/types';
import type { TimelineRevealRequest } from '../types';

/** A reveal is a view command; it never changes zoom, selection or the receiving track. */
export function useTimelineReveal(params: {
  request: TimelineRevealRequest | undefined;
  project: VideoProject;
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
    if (!request) return;
    let interval: { startTime: number; duration: number } | undefined;
    let selector: string;
    if (request.kind === 'clip') {
      interval = model.project.clips.find(({ id }) => id === request.clipId);
      selector = `[data-project-timeline-clip="${CSS.escape(request.clipId)}"]`;
    } else {
      const document = model.project.sourceVoiceoverDocuments?.find(
        (item) => item.id === request.documentId
      );
      const view =
        document &&
        projectSourceVoiceoverViews(model.project, document).find(
          (item) => item.clip.id === request.viewId
        );
      if (view) interval = { startTime: view.clip.timelineStart, duration: view.clip.duration };
      selector = `[data-source-voiceover-view="${CSS.escape(request.viewId)}"]`;
    }
    if (!interval) return;
    model.navigateTo(
      interval.startTime + interval.duration / 2 - model.viewportWidth / model.pixelsPerSecond / 2
    );
    // Horizontal navigation materializes clips outside the previous virtual window.
    const frame = requestAnimationFrame(() => {
      if (latest.current.project !== model.project) return;
      const timeline = model.timelineRef.current;
      const trackList = model.trackListRef.current;
      const element = timeline?.querySelector<HTMLElement>(selector);
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
