import { expect, it } from 'vitest';
import { getNextColorSelectorFormatMode } from './types';

it('cycles color selector format modes in order and wraps to hex', () => {
  expect(getNextColorSelectorFormatMode('hex')).toBe('rgb');
  expect(getNextColorSelectorFormatMode('rgb')).toBe('hsl');
  expect(getNextColorSelectorFormatMode('hsl')).toBe('hex');
});
