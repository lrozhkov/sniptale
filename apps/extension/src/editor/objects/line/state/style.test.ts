import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFabricShadow: vi.fn(() => ({ shadow: true })),
}));

vi.mock('../../shadow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shadow')>()),
  createFabricShadow: mocks.createFabricShadow,
}));

vi.mock('../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/model')>()),
  hexToRgba: (color: string, opacity: number) => `${color}:${opacity}`,
}));

import { applyLineControlStyle, applyLinePathStyle } from './style';

it('applies line path style through fabric path state and shadow owner', () => {
  const line = { set: vi.fn() };
  const draft = { path: [['M', 0, 0]] };

  applyLinePathStyle(
    line as never,
    draft as never,
    {
      color: '#123456',
      corners: 'round',
      opacity: 0.5,
      shadow: 20,
      style: 'solid',
      width: 4,
    } as never
  );

  expect(line.set).toHaveBeenCalledWith(
    expect.objectContaining({
      path: draft.path,
      shadow: { shadow: true },
      stroke: '#123456:0.5',
      strokeLineCap: 'round',
      strokeWidth: 4,
    })
  );
});

it('applies drawing and edit-mode control state', () => {
  const line = { sniptaleLineDrawing: true, sniptaleLineEditMode: true, set: vi.fn() };

  applyLineControlStyle(line as never);

  expect(line.set).toHaveBeenCalledWith(
    expect.objectContaining({
      hasBorders: false,
      hasControls: false,
      lockScalingX: true,
      lockScalingY: true,
    })
  );
});
