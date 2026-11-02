import { describe, expect, it } from 'vitest';
import { getDictionary, translate, type TranslationKey } from './index';

function collectLocalizedValues(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (typeof node !== 'object' || node === null) return [];
  return Object.values(node).flatMap(collectLocalizedValues);
}

describe('highlighter messages', () => {
  it('keeps the shared shadow label short across shipped locales', () => {
    expect(localized('highlighter.editor.shadowLabel')).toEqual({
      ru: 'Тень',
      en: 'Shadow',
    });
  });

  it('uses template terminology across highlighter settings and content popovers', () => {
    const values = ['en', 'ru'].flatMap((locale) => {
      const dictionary = getDictionary(locale === 'en' ? 'en' : 'ru');
      return collectLocalizedValues({
        callout: dictionary.content.callout,
        frame: dictionary.content.interactiveFrame,
        highlighter: dictionary.highlighter,
        overlay: dictionary.content.overlayControls,
        stepBadge: dictionary.content.stepBadge,
      });
    });

    expect(values.filter((value) => /пресет/i.test(value))).toEqual([]);
    expect(values.filter((value) => /\bpresets?\b/i.test(value))).toEqual([]);
  });

  it('keeps callout line controls separated into user-facing concepts', () => {
    expect(localized('content.callout.manualConnector')).toEqual({
      ru: 'Указатель',
      en: 'Pointer',
    });
    expect(localized('content.callout.connectorSection')).toEqual({
      ru: 'Тип указателя',
      en: 'Pointer type',
    });
    expect(localized('content.callout.routingLabel')).toEqual({
      ru: 'Форма линии',
      en: 'Line shape',
    });
    expect(localized('content.callout.lineStyleLabel')).toEqual({
      ru: 'Стиль линии',
      en: 'Line style',
    });
  });
});

function localized(key: TranslationKey) {
  return { en: translate(key, 'en'), ru: translate(key, 'ru') };
}
