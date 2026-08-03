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
  const insertionPrefix = prefix.length > 0 && !/\s$/u.test(prefix) ? `${prefix} ` : prefix;
  const suffix = draft.slice(position);
  let finalText = '';
  let interimText = '';
  let lastSequence = -1;

  return {
    apply(event) {
      if (event.sequence <= lastSequence) return null;
      lastSequence = event.sequence;
      const fragment = event.text.trim();
      if (event.isFinal) {
        finalText = `${finalText}${finalText && fragment ? ' ' : ''}${fragment}`.slice(
          0,
          VOICE_INPUT_TRANSCRIPT_MAX_CHARS
        );
        interimText = '';
      } else {
        const separatorLength = finalText && fragment ? 1 : 0;
        interimText = fragment.slice(
          0,
          Math.max(VOICE_INPUT_TRANSCRIPT_MAX_CHARS - finalText.length - separatorLength, 0)
        );
      }
      const voiceText = `${finalText}${finalText && interimText ? ' ' : ''}${interimText}`;
      if (!voiceText) return null;
      const suffixSeparator = suffix.length > 0 && !/^\s/u.test(suffix) ? ' ' : '';
      const existingSuffixSpacing = /^\s+/u.exec(suffix)?.[0].length ?? 0;
      return {
        caretPosition:
          insertionPrefix.length +
          voiceText.length +
          (suffixSeparator ? suffixSeparator.length : existingSuffixSpacing),
        value: `${insertionPrefix}${voiceText}${suffixSeparator}${suffix}`,
      };
    },
  };
}
