import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isArrowObject: vi.fn(),
  isLineObject: vi.fn(),
  updateArrowObject: vi.fn(),
  updateLineObject: vi.fn(),
}));

vi.mock('../../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/arrow')>()),
  isArrowObject: mocks.isArrowObject,
  updateArrowObject: mocks.updateArrowObject,
}));

vi.mock('../../../objects/line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/line')>()),
  isLineObject: mocks.isLineObject,
  updateLineObject: mocks.updateLineObject,
}));

import { applyArrowSettings, applyLineSettings } from './line';

it('applies line and arrow settings only to matching object adapters', () => {
  const arrow = { id: 'arrow' };
  const line = { id: 'line' };
  mocks.isArrowObject.mockImplementation((object) => object === arrow);
  mocks.isLineObject.mockImplementation((object) => object === line);

  applyArrowSettings([arrow, line] as never, { width: 4 } as never);
  applyLineSettings([arrow, line] as never, { width: 2 } as never);

  expect(mocks.updateArrowObject).toHaveBeenCalledWith(arrow, { settings: { width: 4 } });
  expect(mocks.updateLineObject).toHaveBeenCalledWith(line, { settings: { width: 2 } });
});
