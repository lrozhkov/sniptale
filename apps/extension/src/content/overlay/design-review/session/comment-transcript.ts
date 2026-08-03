import { VOICE_INPUT_TRANSCRIPT_MAX_CHARS } from '@sniptale/runtime-contracts/voice-input';

interface CommentTranscriptUpdate {
  caretPosition: number;
  value: string;
}

export interface CommentTranscriptInsertion {
  apply(args: { isFinal: boolean; sequence: number; text: string }): CommentTranscriptUpdate | null;
}

/** Owns the replaceable voice span while preserving all text around the captured caret. */
export function createCommentTranscriptInsertion(
  draft: string,
  requestedPosition: number
): CommentTranscriptInsertion {
  const position = Math.min(Math.max(requestedPosition, 0), draft.length);
  const prefix = draft.slice(0, position);
  const suffix = draft.slice(position);
  let finalText = '';
  let interimText = '';
  let lastSequence = -1;

  return {
    apply(event) {
      if (event.sequence <= lastSequence) return null;
      lastSequence = event.sequence;
      if (event.isFinal) {
        finalText = `${finalText}${event.text}`.slice(0, VOICE_INPUT_TRANSCRIPT_MAX_CHARS);
        interimText = '';
      } else {
        interimText = event.text.slice(
          0,
          Math.max(VOICE_INPUT_TRANSCRIPT_MAX_CHARS - finalText.length, 0)
        );
      }
      const voiceText = `${finalText}${interimText}`;
      return {
        caretPosition: prefix.length + voiceText.length,
        value: `${prefix}${voiceText}${suffix}`,
      };
    },
  };
}
