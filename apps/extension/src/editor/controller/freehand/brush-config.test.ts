import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFabricShadow: vi.fn(() => ({ blur: 6 })),
  hexToRgba: vi.fn((color: string, opacity: number) => `${color}:${opacity}`),
}));

vi.mock('../../objects/shadow', async () => ({
  ...(await vi.importActual<typeof import('../../objects/shadow')>('../../objects/shadow')),
  createFabricShadow: mocks.createFabricShadow,
}));

vi.mock('../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../document/model')>('../../document/model')),
  hexToRgba: mocks.hexToRgba,
}));

import { applyLiveFreehandBrushSettings, getBrushDecimate } from './brush-config';

describe('editor-controller/freehand/brush-config', () => {
  it('applies live freehand brush settings and clamps decimation', () => {
    const brush = {
      color: '',
      decimate: 0,
      dynamicWidth: false,
      shadow: null,
      smoothingLevel: 0,
      width: 1,
    };

    applyLiveFreehandBrushSettings(brush, {
      color: '#00aa00',
      dynamicWidth: true,
      opacity: 0.35,
      shapeCorrection: 'subtle',
      shadow: 30,
      smoothingLevel: 12,
      width: 9,
    });

    expect(brush).toMatchObject({
      color: '#00aa00:0.35',
      decimate: 1,
      dynamicWidth: true,
      smoothingLevel: 12,
      width: 9,
    });
    expect(mocks.createFabricShadow).toHaveBeenCalledWith(30, '#00aa00', {
      angle: 90,
      blur: 12,
      distance: 4,
    });
    expect(
      getBrushDecimate({
        color: '#000000',
        opacity: 1,
        shapeCorrection: 'off',
        shadow: 0,
        smoothingLevel: -1,
        width: 1,
      })
    ).toBe(0);
  });
});
