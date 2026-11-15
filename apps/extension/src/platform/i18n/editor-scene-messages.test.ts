import { describe, expect, it } from 'vitest';
import { getCatalogFixture, translateCatalogFixture } from './catalog-fixture.test-support';
import type { TranslationKey } from './types';

describe('editor scene messages', () => {
  it('defines the visible gradient angle label and removes the exact-input message key', () => {
    expect(localized('editor.scene.gradientAngleLabel')).toEqual({
      ru: 'Угол',
      en: 'Angle',
    });
    expect(getCatalogFixture('en').editor.scene).not.toHaveProperty('gradientAngleExactAria');
  });
});

function localized(key: TranslationKey) {
  return { en: translateCatalogFixture(key, 'en'), ru: translateCatalogFixture(key, 'ru') };
}
