import type { RefObject } from 'react';
import type { ReviewAnchor, ReviewAnnotation } from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import type { useReviewComposer } from './use-session';
import type { ReviewPlaybackRange } from './playback-range';

/** Text-comment selection and draft creation remain one editor-local workflow. */
export function useReviewCommentActions(args: {
  composer: ReturnType<typeof useReviewComposer>;
  time: number;
  playbackRange: ReviewPlaybackRange | null;
  video: RefObject<HTMLVideoElement | null>;
  seek(value: number, snap?: boolean): void;
  setSelection(value: ReviewAnchor): void;
  setSelected(value: ReviewAnnotation | null): void;
  setCutting(cutting: false): void;
  canStart(): boolean;
  busy: boolean;
  exporterPhase: string;
}) {
  const select = (annotation: ReviewAnnotation) => {
    args.setCutting(false);
    args.video.current?.pause();
    args.setSelected(annotation);
    args.seek(
      annotation.anchor.kind === 'point' ? annotation.anchor.time : annotation.anchor.start,
      false
    );
    args.setSelection(annotation.anchor);
  };
  const add = (marker?: ReviewTelemetryMarker) => {
    if (args.busy || args.exporterPhase !== 'idle' || !args.canStart()) return;
    args.setCutting(false);
    args.video.current?.pause();
    // Admission can finish a draft first; this render retains the requested source-time anchor.
    const anchor: ReviewAnchor = marker
      ? { kind: 'point', time: marker.start }
      : args.playbackRange
        ? { kind: 'range', ...args.playbackRange }
        : { kind: 'point', time: args.time };
    args.seek(anchor.kind === 'point' ? anchor.time : anchor.start, false);
    args.composer.change(
      {
        id: crypto.randomUUID(),
        text: '',
        anchor,
        ...(marker ? { telemetryRef: marker.ref } : {}),
      },
      null
    );
    if (marker) {
      args.setCutting(false);
      args.seek(marker.start, false);
      args.setSelection(anchor);
    }
  };
  return { select, add };
}
