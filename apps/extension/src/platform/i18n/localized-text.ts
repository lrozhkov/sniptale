import { translate } from './index';
import type { Translate, TranslationKey } from './types';

export function resolveLocalizedText(
  label: { fallback: string; key?: string | undefined },
  translator: Translate = translate
): string {
  if (!label.key) return label.fallback;
  const resolved = translator(label.key as TranslationKey);
  return resolved === label.key ? label.fallback : resolved;
}
