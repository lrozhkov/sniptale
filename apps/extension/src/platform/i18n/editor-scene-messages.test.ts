import { describe, expect, it } from 'vitest';
import { getDictionary, translate, type TranslationKey } from './index';

describe('editor scene messages', () => {
  it('defines the visible gradient angle label and removes the exact-input message key', () => {
    expect(localized('editor.scene.gradientAngleLabel')).toEqual({
      ru: 'Угол',
      en: 'Angle',
    });
    expect(getDictionary('en').editor.scene).not.toHaveProperty('gradientAngleExactAria');
  });
});

function localized(key: TranslationKey) {
  return { en: translate(key, 'en'), ru: translate(key, 'ru') };
}
