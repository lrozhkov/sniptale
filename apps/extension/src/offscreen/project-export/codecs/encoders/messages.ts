import { translate, type TranslationKey } from '../../../../platform/i18n';

export function buildMissingEncoderMessage(args: {
  attempts: string[];
  prefixKey: TranslationKey;
  suffixKey: TranslationKey;
}): string {
  return `${translate(args.prefixKey)} ${args.attempts.join(', ')}${translate(args.suffixKey)}`;
}

export function recordEncoderAttemptFailure(
  attempts: string[],
  label: string,
  codec: string,
  error?: unknown
) {
  attempts.push(
    error
      ? `${label} [${codec}] (${error instanceof Error ? error.message : String(error)})`
      : `${label} [${codec}]`
  );
}
