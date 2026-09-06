import { useRef, type RefObject } from 'react';
import { useVoiceInputSession } from '../../composition/voice-input/session';
import type { ReviewAnnotation } from '../../features/video/review/types';

/** Final speech belongs only to the composer and insertion point that started this session. */
export function useReviewVoice(args: {
  annotation: ReviewAnnotation;
  textarea: RefObject<HTMLTextAreaElement | null>;
  onText(text: string): void;
}) {
  const current = useRef(args.annotation);
  current.current = args.annotation;
  const placement = useRef<{ id: string; start: number; end: number; sequence: number } | null>(
    null
  );
  const voice = useVoiceInputSession({
    onTranscript(event) {
      const target = placement.current;
      if (
        !target ||
        target.id !== current.current.id ||
        !event.isFinal ||
        event.sequence <= target.sequence
      )
        return;
      target.sequence = event.sequence;
      const text = current.current.text;
      const start = Math.min(target.start, text.length);
      const end = Math.min(target.end, text.length);
      const next = text.slice(0, start) + event.text + text.slice(end);
      current.current = { ...current.current, text: next };
      args.onText(next);
      target.start = start + event.text.length;
      target.end = target.start;
    },
  });
  return {
    state: voice.state,
    start() {
      const field = args.textarea.current;
      placement.current = {
        id: args.annotation.id,
        start: field?.selectionStart ?? args.annotation.text.length,
        end: field?.selectionEnd ?? args.annotation.text.length,
        sequence: -1,
      };
      void voice.actions.start();
    },
    stop() {
      placement.current = null;
      voice.actions.stop();
    },
    moveCaret() {
      const field = args.textarea.current;
      if (field && placement.current) {
        placement.current.start = field.selectionStart;
        placement.current.end = field.selectionEnd;
      }
    },
  };
}
