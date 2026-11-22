import { describe, expect, it } from 'vitest';
import { getCatalogFixture, translateCatalogFixture } from './catalog-fixture.test-support';
import type { TranslationKey } from './types';

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
    expect(getCatalogFixture('en').editor.compact.arrowStartHeadSize).toBe('Start size');
    expect(getCatalogFixture('en').editor.compact.arrowEndHeadSize).toBe('End size');
    expect(getCatalogFixture('en').editor.compact).not.toHaveProperty('arrowStyleStandard');
    expect(getCatalogFixture('en').editor.compact).not.toHaveProperty('arrowStyleCurved');
    expect(getCatalogFixture('en').editor.compact).not.toHaveProperty('arrowStyleOpen');
    expect(getCatalogFixture('en').editor.compact).not.toHaveProperty('arrowStyleBlock');
  });
});

function localized(key: TranslationKey) {
  return { en: translateCatalogFixture(key, 'en'), ru: translateCatalogFixture(key, 'ru') };
}
