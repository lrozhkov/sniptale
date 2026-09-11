import { isEffectV1LocaleTag } from './locale-tags';
import type { ControlDefinition, LocaleText } from './base.js';

/** Imported labels follow the requested locale, its language, then English. */
export function resolveEffectLocaleText(value: LocaleText | undefined, locale: string): string {
  if (!value) return '';
  const exact = isEffectV1LocaleTag(locale) ? locale.toLowerCase() : 'en';
  const entries = new Map(Object.entries(value).map(([key, text]) => [key.toLowerCase(), text]));
  for (const key of [exact, exact.split('-')[0]!, 'en']) {
    const text = entries.get(key);
    if (text?.trim()) return text;
  }
  return '';
}

/** Only for creating a new instance. Stored control values, including empty strings, are authoritative. */
export function resolveEffectV1ControlDefault(
  control: ControlDefinition,
  locale: string
): number | string {
  if (control.kind !== 'text' || !control.localizedDefaultValue) return control.defaultValue;
  return resolveEffectLocaleText(control.localizedDefaultValue, locale) || control.defaultValue;
}
