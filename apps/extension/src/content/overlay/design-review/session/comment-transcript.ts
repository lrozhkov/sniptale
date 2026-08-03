import { VOICE_INPUT_TRANSCRIPT_MAX_CHARS } from '@sniptale/runtime-contracts/voice-input';

interface CommentTranscriptUpdate {
  caretPosition: number;
  value: string;
}

export interface CommentTranscriptInsertion {
  apply(args: { isFinal: boolean; sequence: number; text: string }): CommentTranscriptUpdate | null;
}

/** Appends stable voice fragments after the captured caret while preserving surrounding text. */
export function createCommentTranscriptInsertion(
  draft: string,
  requestedPosition: number
): CommentTranscriptInsertion {
  const position = Math.min(Math.max(requestedPosition, 0), draft.length);
  const prefix = draft.slice(0, position);
  const insertionPrefix = prefix.length > 0 && !/\s$/u.test(prefix) ? `${prefix} ` : prefix;
  const suffix = draft.slice(position);
  let finalText = '';
  let lastSequence = -1;

  return {
    apply(event) {
      if (event.sequence <= lastSequence) return null;
      lastSequence = event.sequence;
      if (!event.isFinal) return null;
      const fragment = event.text.trim();
      if (!fragment) return null;
      finalText = `${finalText}${finalText ? ' ' : ''}${fragment}`.slice(
        0,
        VOICE_INPUT_TRANSCRIPT_MAX_CHARS
      );
      const suffixSeparator = suffix.length > 0 && !/^\s/u.test(suffix) ? ' ' : '';
      const existingSuffixSpacing = /^\s+/u.exec(suffix)?.[0].length ?? 0;
      return {
        caretPosition:
          insertionPrefix.length +
          finalText.length +
          (suffixSeparator ? suffixSeparator.length : existingSuffixSpacing),
        value: `${insertionPrefix}${finalText}${suffixSeparator}${suffix}`,
      };
    },
  };
}
