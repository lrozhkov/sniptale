import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceInputClient } from '../../../../../workflows/voice-input';
import { useContentVoiceInputSession } from '../../../../voice-input/session';
import {
  createTextTranscriptInsertion,
  type TextTranscriptInsertion,
} from '../../../../voice-input/text-transcript';

export function useAIModalPromptVoiceInput(args: {
  enabled: boolean;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  createClient?: () => VoiceInputClient;
}) {
  const [caretPosition, setCaretPosition] = useState<number | null>(null);
  const insertionRef = useRef<TextTranscriptInsertion | null>(null);
  const setPromptRef = useRef(args.setPrompt);
  setPromptRef.current = args.setPrompt;
  const session = useContentVoiceInputSession({
    createClient: args.createClient,
    onTranscript: (event) => {
      const update = insertionRef.current?.apply(event);
      if (!update) return;
      setCaretPosition(update.caretPosition);
      setPromptRef.current(update.value);
    },
  });
  const startSession = session.actions.start;
  const cancelSession = session.actions.cancel;
  const cancel = useCallback(() => {
    insertionRef.current = null;
    setCaretPosition(null);
    cancelSession();
  }, [cancelSession]);
  const stop = session.actions.stop;

  const start = useCallback(
    (prompt: string, caret: number) => {
      if (!args.enabled || session.state.active || session.state.pending) return;
      insertionRef.current = createTextTranscriptInsertion(prompt, caret);
      setCaretPosition(caret);
      void startSession();
    },
    [args.enabled, session.state.active, session.state.pending, startSession]
  );

  useEffect(() => {
    if (args.enabled) return;
    cancel();
  }, [args.enabled, cancel]);

  return {
    actions: { start, stop, cancel },
    state: { ...session.state, caretPosition },
  };
}
