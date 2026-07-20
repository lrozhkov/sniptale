import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getArrowSettings: vi.fn(() => ({ width: 4 })),
  getLineSettings: vi.fn(() => ({ width: 2 })),
  isArrowObject: vi.fn(),
  isBlurObject: vi.fn(),
  isLineObject: vi.fn(),
  updateArrowObject: vi.fn(),
  updateBlurObject: vi.fn(),
  updateLineObject: vi.fn(),
}));

vi.mock('../../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/arrow')>()),
  getArrowSettings: mocks.getArrowSettings,
  isArrowObject: mocks.isArrowObject,
  updateArrowObject: mocks.updateArrowObject,
}));

vi.mock('../../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation/blur/object')>()),
  isBlurObject: mocks.isBlurObject,
  updateBlurObject: mocks.updateBlurObject,
}));

vi.mock('../../../objects/line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/line')>()),
  getLineSettings: mocks.getLineSettings,
  isLineObject: mocks.isLineObject,
  updateLineObject: mocks.updateLineObject,
}));

import { refreshPreparedObjectGeometry } from './geometry-refresh';

it('refreshes object geometry through arrow, line, and blur owners', () => {
  const object = { id: 'object' };
  mocks.isArrowObject.mockReturnValue(true);
  mocks.isLineObject.mockReturnValue(true);
  mocks.isBlurObject.mockReturnValue(true);

  refreshPreparedObjectGeometry(object as never, null);

  expect(mocks.updateArrowObject).toHaveBeenCalledWith(object, { settings: { width: 4 } });
  expect(mocks.updateLineObject).toHaveBeenCalledWith(object, { settings: { width: 2 } });
  expect(mocks.updateBlurObject).toHaveBeenCalledWith(object);
});
