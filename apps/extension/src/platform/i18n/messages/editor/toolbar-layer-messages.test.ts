import { describe, expect, it } from 'vitest';
import { editorToolbarLayerMessages } from './toolbar-layer-messages';

describe('editorToolbarLayerMessages', () => {
  it('keeps short layer-effect labels localized for the expanded layer row', () => {
    expect(editorToolbarLayerMessages.layerEffectsAdjustmentsShort).toEqual({
      en: 'Adjust',
      ru: 'Коррекция',
    });
    expect(editorToolbarLayerMessages.layerEffectsTransformationsShort).toEqual({
      en: 'Transform',
      ru: 'Трансформ',
    });
    expect(editorToolbarLayerMessages.layerEffectsFiltersShort).toEqual({
      en: 'Filter',
      ru: 'Фильтр',
    });
  });
});
