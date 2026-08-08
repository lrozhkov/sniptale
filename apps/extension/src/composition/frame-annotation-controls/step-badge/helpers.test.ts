import { expect, it } from 'vitest';
import { getDefaultStepBadgeAlphabet } from './helpers';

it('defaults Russian numbering to Cyrillic and every other supported locale to Latin', () => {
  expect(getDefaultStepBadgeAlphabet('ru')).toBe('cyrillic');
  expect(getDefaultStepBadgeAlphabet('en')).toBe('latin');
});
