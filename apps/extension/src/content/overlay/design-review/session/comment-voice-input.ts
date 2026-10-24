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
  const cancelSession = session.actions.cancel;
  const cancel = useCallback(() => {
    insertionRef.current = null;
    setCaretPosition(null);
    cancelSession();
  }, [cancelSession]);

  const start = useCallback(
    (draft: string, caret: number) => {
      if (session.state.active || session.state.pending) return Promise.resolve();
      insertionRef.current = createTextTranscriptInsertion(draft, caret);
      setCaretPosition(caret);
      return startSession();
    },
    [session.state.active, session.state.pending, startSession]
  );

  return {
    actions: { start, stop: session.actions.stop, cancel },
    state: { ...session.state, caretPosition },
  };
}
