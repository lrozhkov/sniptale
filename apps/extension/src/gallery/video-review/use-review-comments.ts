import { reviewInsertionTarget } from './range-placement';
import type { RefObject } from 'react';
import type { ReviewAnchor, ReviewAnnotation } from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import type { useReviewComposer } from './use-session';
import type { ReviewPlaybackRange } from './playback-range';
import {
  reviewCommandInsertion,
  type ReviewCommandContext,
  type ReviewCommandPort,
} from './command-context';

/** Text-comment selection and draft creation remain one editor-local workflow. */
export function useReviewCommentActions(args: {
  commands: ReviewCommandPort;
  composer: ReturnType<typeof useReviewComposer>;
  time: number;
  playbackRange: ReviewPlaybackRange | null;
  video: RefObject<HTMLVideoElement | null>;
  pause?: (() => void) | undefined;
  seek(value: number, snap?: boolean): void;
  setSelection(value: ReviewAnchor): void;
  setSelected(value: ReviewAnnotation | null): void;
  setCutting(cutting: false): void;
  canStart(): boolean;
  busy: boolean;
  exporterPhase: string;
}) {
  const select = (annotation: ReviewAnnotation, context?: ReviewCommandContext) => {
    if (!context) {
      const captured = args.commands.capture();
      if (captured) args.commands.admit(captured, (accepted) => select(annotation, accepted));
      return;
    }
    if (!args.commands.isCurrent(context, 'source')) return;
    args.setCutting(false);
    args.setSelected(annotation);
    args.setSelection(annotation.anchor);
  };
  const add = (marker?: ReviewTelemetryMarker) => {
    if (args.busy || args.exporterPhase !== 'idle' || !args.canStart()) return;
    const context = args.commands.capture();
    if (!context) return;
    args.commands.admit(context, (accepted) => {
      const insertion = reviewCommandInsertion(accepted, 'source');
      if (!insertion) return;
      args.setCutting(false);
      // Admission can finish a draft first; this render retains the requested source-time anchor.
      const anchor: ReviewAnchor = marker
        ? { kind: 'point', time: marker.start }
        : insertion.range
          ? { kind: 'range', ...reviewInsertionTarget(insertion.time, insertion.range)! }
          : { kind: 'point', time: insertion.time };
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
    });
  };
  return { select, add };
}
