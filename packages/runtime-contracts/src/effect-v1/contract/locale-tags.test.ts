import { expect, it } from 'vitest';
import { isEffectV1LocaleTag } from '../model/locale-tags';
import { resolveEffectLocaleText } from '../model/locale';

it.each([
  'en',
  'x-private',
  'i-klingon',
  'zh-cmn',
  'zh-Hant-TW',
  'en-u-ca-gregory',
  'sl-rozaj-biske',
  'sgn-BE-FR',
])('accepts well-formed SDK locale %s', (tag) => {
  expect(isEffectV1LocaleTag(tag)).toBe(true);
});
it.each([
  '',
  'en_US',
  'en-',
  'en-a',
  'en-u-ca-u-nu',
  'sl-rozaj-rozaj',
  'x',
  'en-abcdefghi',
  'x-' + 'a-'.repeat(40) + 'a',
])('rejects malformed SDK locale %s', (tag) => {
  expect(isEffectV1LocaleTag(tag)).toBe(false);
});
it('skips empty translations and uses case-insensitive exact, language, English fallback', () => {
  const label = { en: 'English', ru: 'Русский', 'ru-RU': '  ', 'x-Private': 'Private' };
  expect(resolveEffectLocaleText(label, 'ru-RU')).toBe('Русский');
  expect(resolveEffectLocaleText(label, 'X-private')).toBe('Private');
  expect(resolveEffectLocaleText(label, 'bad_tag')).toBe('English');
});
