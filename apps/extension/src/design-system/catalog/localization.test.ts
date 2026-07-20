import { describe, expect, it } from 'vitest';
import { localize } from './localization';

describe('design-system copy localization', () => {
  it('returns the Russian variant for the Russian locale', () => {
    expect(localize('ru', 'Привет', 'Hello')).toBe('Привет');
  });

  it('returns the English variant for non-Russian locales', () => {
    expect(localize('en', 'Привет', 'Hello')).toBe('Hello');
  });
});
