import { describe, expect, it } from 'vitest';
import { translateCatalogFixture } from './catalog-fixture.test-support';
import type { TranslationKey } from './types';

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
  return { en: translateCatalogFixture(key, 'en'), ru: translateCatalogFixture(key, 'ru') };
}
