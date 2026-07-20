import { expect, it } from 'vitest';

import {
  getTextCalloutBackgroundColor,
  getTextCalloutPadding,
  resolveTextCalloutFormat,
} from './format';

it('resolves callout format, padding, and background color policy', () => {
  expect(resolveTextCalloutFormat({ sniptaleTextCalloutFormat: 'plain' } as never)).toBe('plain');
  expect(resolveTextCalloutFormat({ sniptaleTextCalloutFormat: 'legacy' } as never)).toBe('bubble');

  expect(getTextCalloutPadding('plain')).toBe(0);
  expect(getTextCalloutPadding('panel')).toBeGreaterThan(0);

  expect(getTextCalloutBackgroundColor({ calloutFormat: 'plain' } as never)).toBe('');
  expect(
    getTextCalloutBackgroundColor({
      backgroundColor: '#abcdef',
      calloutFormat: 'bubble',
    } as never)
  ).toBe('#abcdef');
});
