import { VOICE_INPUT_TRANSCRIPT_MAX_CHARS } from '@sniptale/runtime-contracts/voice-input';

interface TextTranscriptUpdate {
  caretPosition: number;
  value: string;
}

export interface TextTranscriptInsertion {
  apply(args: { isFinal: boolean; sequence: number; text: string }): TextTranscriptUpdate | null;
}

/** Owns one replaceable voice span while preserving the text around the captured caret. */
export function createTextTranscriptInsertion(
  value: string,
  requestedPosition: number
): TextTranscriptInsertion {
  const position = Math.min(Math.max(requestedPosition, 0), value.length);
  const prefix = value.slice(0, position);
  const suffix = value.slice(position);
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
      if (!voiceText) return { caretPosition: position, value };

      const insertionPrefix = prefix.length > 0 && !/\s$/u.test(prefix) ? `${prefix} ` : prefix;
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
