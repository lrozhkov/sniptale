import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFabricShadow: vi.fn(() => ({ shadow: true })),
  hexToRgba: vi.fn((color: string, opacity: number) => `${color}:${opacity}`),
}));

vi.mock('../../../objects/shadow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/shadow')>()),
  createFabricShadow: mocks.createFabricShadow,
}));

vi.mock('../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/model')>()),
  hexToRgba: mocks.hexToRgba,
}));

import { applyFreehandObjectStyle } from './style';

it('applies static stroke style and shadow metadata to freehand objects', () => {
  const object = { sniptaleType: 'highlighter', set: vi.fn() };

  applyFreehandObjectStyle(
    object as never,
    {
      color: '#ff0000',
      opacity: 0.5,
      shadow: 30,
      width: 6,
    } as never
  );

  expect(object).toMatchObject({
    sniptaleBrushDynamicWidth: false,
    sniptaleBrushShadowAngle: 90,
    sniptaleBrushShadowBlur: 12,
    sniptaleBrushShadowColor: '#ff0000',
    sniptaleBrushShadowDistance: 4,
    sniptaleBrushWidth: 6,
  });
  expect(object.set).toHaveBeenCalledWith(
    expect.objectContaining({
      fill: '',
      shadow: { shadow: true },
      stroke: '#ff0000:0.5',
      strokeWidth: 6,
    })
  );
});

it('uses fill and transparent stroke for dynamic-width pencil paths', () => {
  const object = { sniptaleType: 'pencil', set: vi.fn() };

  applyFreehandObjectStyle(
    object as never,
    {
      color: '#123456',
      dynamicWidth: true,
      opacity: 0.75,
      shadow: 0,
      width: 8,
    } as never
  );

  expect((object as { sniptaleBrushDynamicWidth?: boolean }).sniptaleBrushDynamicWidth).toBe(true);
  expect(object.set).toHaveBeenCalledWith(
    expect.objectContaining({
      fill: '#123456:0.75',
      stroke: 'transparent',
      strokeWidth: 0,
    })
  );
});
