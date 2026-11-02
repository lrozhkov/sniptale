import { describe, expect, it } from 'vitest';
import { translate, type TranslationKey } from './index';

describe('editor toolbar layer messages', () => {
  it('keeps short layer-effect labels localized for the expanded layer row', () => {
    expect(localized('editor.toolbar.layerEffectsAdjustmentsShort')).toEqual({
      en: 'Adjust',
      ru: 'Коррекция',
    });
    expect(localized('editor.toolbar.layerEffectsTransformationsShort')).toEqual({
      en: 'Transform',
      ru: 'Трансформ',
    });
    expect(localized('editor.toolbar.layerEffectsFiltersShort')).toEqual({
      en: 'Filter',
      ru: 'Фильтр',
    });
  });
});

function localized(key: TranslationKey) {
  return { en: translate(key, 'en'), ru: translate(key, 'ru') };
}
