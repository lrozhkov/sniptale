import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyFreehandSettingsToObject: vi.fn(),
}));

vi.mock('../../freehand', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../freehand')>()),
  applyFreehandSettingsToObject: mocks.applyFreehandSettingsToObject,
}));

import { applyBrushSettings } from './brush';

it('applies freehand brush settings to every selected object', () => {
  const first = { id: 'first' };
  const second = { id: 'second' };
  const settings = { color: '#123456' };

  applyBrushSettings([first, second] as never, settings as never);

  expect(mocks.applyFreehandSettingsToObject).toHaveBeenCalledWith(first, settings);
  expect(mocks.applyFreehandSettingsToObject).toHaveBeenCalledWith(second, settings);
});
