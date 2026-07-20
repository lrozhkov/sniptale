import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasArrowPointControlsMock: vi.fn(() => true),
}));

vi.mock('../variant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../variant')>()),
  hasArrowPointControls: mocks.hasArrowPointControlsMock,
}));

import { resolveArrowStoredPointFromControl } from './reverse';

const settings = {
  arrowType: 'sharp',
  color: '#fff',
  endHead: 'triangle',
  mode: 'straight',
  opacity: 1,
  shadow: 0,
  startHead: 'none',
  variant: 'standard',
  width: 4,
} as const;

beforeEach(() => {
  mocks.hasArrowPointControlsMock.mockReturnValue(true);
});

it('resolves stored endpoint positions from offset display handles', () => {
  expect(
    resolveArrowStoredPointFromControl(
      settings,
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
      1,
      { x: -28, y: 0 }
    )
  ).toEqual({ x: -22, y: 0 });
});

it('returns display points unchanged when arrow point controls are unavailable', () => {
  mocks.hasArrowPointControlsMock.mockReturnValue(false);

  expect(resolveArrowStoredPointFromControl(settings, [{ x: 0, y: 0 }], 0, { x: 5, y: 6 })).toEqual(
    { x: 5, y: 6 }
  );
});
