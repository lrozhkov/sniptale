import { describe, expect, it } from 'vitest';

import { localizePreviewCopy } from './copy';

describe('localizePreviewCopy', () => {
  it('returns the Russian copy for ru locales', () => {
    expect(localizePreviewCopy('ru', ['Привет', 'Hello'])).toBe('Привет');
  });

  it('returns the fallback copy for non-ru locales', () => {
    expect(localizePreviewCopy('en', ['Привет', 'Hello'])).toBe('Hello');
  });
});
