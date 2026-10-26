import type { VoiceInputClient } from '../../../../workflows/voice-input';
import { useTextTranscriptVoiceInput } from '../../../voice-input/text-session';

export function useDesignReviewCommentVoiceInput(args: {
  updateDraft(value: string): void;
  createClient?: () => VoiceInputClient;
}) {
  return useTextTranscriptVoiceInput({
    updateText: args.updateDraft,
    createClient: args.createClient,
  });
}
