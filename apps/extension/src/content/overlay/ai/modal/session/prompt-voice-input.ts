import { useCallback, useEffect } from 'react';
import type { VoiceInputClient } from '../../../../../workflows/voice-input';
import { useTextTranscriptVoiceInput } from '../../../../voice-input/text-session';

export function useAIModalPromptVoiceInput(args: {
  enabled: boolean;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  createClient?: () => VoiceInputClient;
}) {
  const session = useTextTranscriptVoiceInput({
    updateText: args.setPrompt,
    createClient: args.createClient,
  });
  const startSession = session.actions.start;
  const cancel = session.actions.cancel;
  const start = useCallback(
    (prompt: string, caret: number) => {
      if (!args.enabled) return;
      void startSession(prompt, caret);
    },
    [args.enabled, startSession]
  );
  useEffect(() => {
    if (args.enabled) return;
    cancel();
  }, [args.enabled, cancel]);
  return {
    actions: { start, stop: session.actions.stop, cancel },
    state: session.state,
  };
}
