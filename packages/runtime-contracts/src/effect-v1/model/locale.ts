import type { LocaleText } from './base.js';

/** Imported labels follow the requested locale, its language, then English. */
export function resolveEffectLocaleText(value: LocaleText | undefined, locale: string): string {
  if (!value) return '';
  const exact = locale.toLowerCase();
  const language = exact.split('-')[0];
  const entries = Object.entries(value);
  return (
    entries.find(([key]) => key.toLowerCase() === exact)?.[1] ??
    entries.find(([key]) => key.toLowerCase() === language)?.[1] ??
    value.en ??
    ''
  );
}
