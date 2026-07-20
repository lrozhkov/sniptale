import { expect, it } from 'vitest';

import {
  FRAME_GRADIENT_PRESET_DATA,
  GRID_COLOR_PALETTE,
  WORKSPACE_BACKGROUND_PALETTE,
} from './data';

it('exposes stable palette and gradient preset data', () => {
  expect(WORKSPACE_BACKGROUND_PALETTE).toHaveLength(16);
  expect(WORKSPACE_BACKGROUND_PALETTE[0]).toBe('#f2f4f7');
  expect(GRID_COLOR_PALETTE).toHaveLength(14);
  expect(GRID_COLOR_PALETTE).not.toEqual(
    expect.arrayContaining(['#2563eb', '#0f766e', '#ca8a04', '#f97316'])
  );
  expect(FRAME_GRADIENT_PRESET_DATA).toHaveLength(6);
  expect(FRAME_GRADIENT_PRESET_DATA[0]).toMatchObject({
    angle: 135,
    from: '#09090b',
    id: 'ocean',
    labelKey: 'editor.compact.gradientOcean',
    to: '#2563eb',
  });
});
