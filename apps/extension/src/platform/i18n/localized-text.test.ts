import { expect, it } from 'vitest';

import { createTranslator } from './index';
import { resolveLocalizedText } from './localized-text';

it('resolves typed localized text through the selected locale and preserves fallback copy', () => {
  const label = {
    fallback: 'Built-in annotations',
    key: 'videoEditor.effectsLibrary.nativeAnnotationsTitle',
  };

  expect(resolveLocalizedText(label, createTranslator('ru'))).toBe('Встроенные аннотации');
  expect(resolveLocalizedText(label, createTranslator('en'))).toBe('Built-in annotations');
  expect(resolveLocalizedText({ fallback: 'Fallback' }, createTranslator('ru'))).toBe('Fallback');
});
