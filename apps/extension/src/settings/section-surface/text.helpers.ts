import { translate, type TranslationKey } from '../../platform/i18n';

type CountLabelTranslationKeys = {
  few: TranslationKey;
  many: TranslationKey;
  one: TranslationKey;
};

/**
 * Resolves the localized noun form for settings counters while preserving the
 * current Russian pluralization behavior and the single-form English fallback.
 */
export function getSettingsCountLabel(count: number, keys: CountLabelTranslationKeys): string {
  const one = translate(keys.one);
  const few = translate(keys.few);
  const many = translate(keys.many);
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (one === few && few === many) {
    return count === 1 ? one : many;
  }

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}
