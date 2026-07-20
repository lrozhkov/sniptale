import { translate } from './index';
import type { Translate, TranslationKey } from './types';

export function resolveLocalizedText(
  label: { fallback: string; key?: string | undefined },
  translator: Translate = translate
): string {
  return label.key ? translator(label.key as TranslationKey) : label.fallback;
}
