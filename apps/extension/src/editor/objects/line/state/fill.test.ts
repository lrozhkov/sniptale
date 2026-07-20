import { expect, it, vi } from 'vitest';

vi.mock('../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/model')>()),
  hexToRgba: (color: string, opacity: number) => `${color}:${opacity}`,
}));

vi.mock('../rough-fill/pattern', () => ({
  createLineRoughFillPattern: () => ({ pattern: true }),
}));

import { resolveLineFill } from './fill';

it('resolves transparent and color line fills from closed state and fill mode', () => {
  expect(resolveLineFill({} as never, { fillMode: 'none' } as never, true)).toBe('transparent');
  expect(
    resolveLineFill(
      {} as never,
      { fillColor: '#123456', fillMode: 'color', fillOpacity: 0.5 } as never,
      false
    )
  ).toBe('transparent');
  expect(
    resolveLineFill(
      {} as never,
      { fillColor: '#123456', fillMode: 'color', fillOpacity: 0.5 } as never,
      true
    )
  ).toBe('#123456:0.5');
});

it('delegates rough line fills to the rough pattern owner', () => {
  expect(resolveLineFill({} as never, { fillMode: 'rough' } as never, true)).toEqual({
    pattern: true,
  });
});
