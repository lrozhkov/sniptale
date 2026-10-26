import { useCallback, useRef, useState } from 'react';
import type { VoiceInputClient } from '../../workflows/voice-input';
import { useContentVoiceInputSession } from './session';
import { createTextTranscriptInsertion, type TextTranscriptInsertion } from './text-transcript';

/** Owns insertion and caret lifetime for text fields using the existing content voice session. */
export function useTextTranscriptVoiceInput(args: {
  updateText(value: string): void;
  createClient?: (() => VoiceInputClient) | undefined;
}) {
  const [caretPosition, setCaretPosition] = useState<number | null>(null);
  const insertion = useRef<TextTranscriptInsertion | null>(null);
  const updateText = useRef(args.updateText);
  updateText.current = args.updateText;
  const session = useContentVoiceInputSession({
    createClient: args.createClient,
    onTranscript: (event) => {
      const update = insertion.current?.apply(event);
      if (!update) return;
      setCaretPosition(update.caretPosition);
      updateText.current(update.value);
    },
  });
  const startSession = session.actions.start;
  const cancelSession = session.actions.cancel;
  const cancel = useCallback(() => {
    insertion.current = null;
    setCaretPosition(null);
    cancelSession();
  }, [cancelSession]);
  const start = useCallback(
    (text: string, caret: number) => {
      if (session.state.active || session.state.pending) return Promise.resolve();
      insertion.current = createTextTranscriptInsertion(text, caret);
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
