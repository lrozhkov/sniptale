import { describe, expect, it } from 'vitest';
import { getDictionary, translate, type TranslationKey } from './index';

describe('editor compact shape messages', () => {
  it('defines the expanded arrow head labels', () => {
    expect(localized('editor.compact.arrowHeadOpen')).toEqual({
      ru: 'Открытый',
      en: 'Open',
    });
    expect(localized('editor.compact.arrowHeadBlock')).toEqual({
      ru: 'Скругленный',
      en: 'Rounded',
    });
    expect(getDictionary('en').editor.compact.arrowStartHeadSize).toBe('Start size');
    expect(getDictionary('en').editor.compact.arrowEndHeadSize).toBe('End size');
    expect(getDictionary('en').editor.compact).not.toHaveProperty('arrowStyleStandard');
    expect(getDictionary('en').editor.compact).not.toHaveProperty('arrowStyleCurved');
    expect(getDictionary('en').editor.compact).not.toHaveProperty('arrowStyleOpen');
    expect(getDictionary('en').editor.compact).not.toHaveProperty('arrowStyleBlock');
  });
});

function localized(key: TranslationKey) {
  return { en: translate(key, 'en'), ru: translate(key, 'ru') };
}
