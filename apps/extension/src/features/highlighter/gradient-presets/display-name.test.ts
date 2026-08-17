import { expect, it } from 'vitest';
import { getGradientPresetDisplayName } from './display-name';

it('localizes canonical system names and preserves custom names', () => {
  expect(
    getGradientPresetDisplayName(
      { id: 'system-sunset', name: 'system-sunset', origin: 'system' },
      'en'
    )
  ).toBe('Sunset');
  expect(
    getGradientPresetDisplayName(
      { id: 'system-sunset', name: 'My gradient', origin: 'system' },
      'ru'
    )
  ).toBe('My gradient');
});
