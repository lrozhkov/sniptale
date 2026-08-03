import { useCallback, useRef, useState } from 'react';
import type { VoiceInputClient } from '../../../../workflows/voice-input';
import { useContentVoiceInputSession } from '../../../voice-input/session';
import {
  createTextTranscriptInsertion,
  type TextTranscriptInsertion,
} from '../../../voice-input/text-transcript';

export function useDesignReviewCommentVoiceInput(args: {
  updateDraft(value: string): void;
  createClient?: () => VoiceInputClient;
}) {
  const [caretPosition, setCaretPosition] = useState<number | null>(null);
  const insertionRef = useRef<TextTranscriptInsertion | null>(null);
  const updateDraftRef = useRef(args.updateDraft);
  updateDraftRef.current = args.updateDraft;
  const session = useContentVoiceInputSession({
    createClient: args.createClient,
    onTranscript: (event) => {
      const update = insertionRef.current?.apply(event);
      if (!update) return;
      setCaretPosition(update.caretPosition);
      updateDraftRef.current(update.value);
    },
  });
  const startSession = session.actions.start;

  const start = useCallback(
    (draft: string, caret: number) => {
      insertionRef.current = createTextTranscriptInsertion(draft, caret);
      setCaretPosition(caret);
      return startSession();
    },
    [startSession]
  );

  return {
    actions: { start, stop: session.actions.stop },
    state: { ...session.state, caretPosition },
  };
}
