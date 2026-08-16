import { expect, it } from 'vitest';
import { getSurfaceStylePresetDisplayName } from './display-name';

it('localizes canonical system names and preserves custom names', () => {
  expect(
    getSurfaceStylePresetDisplayName(
      {
        id: 'system-surface-plain',
        name: 'surfaceStyle.system.plain',
        origin: 'system',
      },
      'en'
    )
  ).toBe('Plain');
  expect(
    getSurfaceStylePresetDisplayName(
      { id: 'system-surface-plain', name: 'My surface', origin: 'system' },
      'ru'
    )
  ).toBe('My surface');
});
