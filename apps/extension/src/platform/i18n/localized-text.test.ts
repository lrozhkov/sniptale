import { expect, it } from 'vitest';

import { createCatalogFixtureTranslator } from './catalog-fixture.test-support';
import { resolveLocalizedText } from './localized-text';
import { createTranslator } from './index';

it('resolves typed localized text through the selected locale and preserves fallback copy', () => {
  const label = {
    fallback: 'Built-in annotations',
    key: 'videoEditor.effectsLibrary.nativeAnnotationsTitle',
  };

  expect(resolveLocalizedText(label, createCatalogFixtureTranslator('ru'))).toBe(
    'Встроенные аннотации'
  );
  expect(resolveLocalizedText(label, createCatalogFixtureTranslator('en'))).toBe(
    'Built-in annotations'
  );
  expect(resolveLocalizedText({ fallback: 'Fallback' }, createCatalogFixtureTranslator('ru'))).toBe(
    'Fallback'
  );
});

it('keeps imported literal copy when an explicit runtime translator has no prepared key', () => {
  expect(
    resolveLocalizedText(
      { fallback: 'Imported template', key: 'outside.prepared.domains' },
      createTranslator('en')
    )
  ).toBe('Imported template');
});

it('preserves an explicitly translated empty label', () => {
  expect(resolveLocalizedText({ fallback: 'Fallback', key: 'common.actions.save' }, () => '')).toBe(
    ''
  );
});
