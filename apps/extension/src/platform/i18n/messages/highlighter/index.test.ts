import { describe, expect, it } from 'vitest';

import { highlighterMessages } from './index';

describe('highlighterMessages', () => {
  it('keeps the shared shadow label short across shipped locales', () => {
    expect(highlighterMessages.editor.shadowLabel).toEqual({
      ru: 'Тень',
      en: 'Shadow',
    });
  });
});
