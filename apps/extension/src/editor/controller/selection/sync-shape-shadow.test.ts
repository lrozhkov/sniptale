import { Rect } from 'fabric';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateSelectionShapeSettings: vi.fn(),
}));

const rectangleSettings = {
  borderPresetId: null,
  customCss: '',
  fillColor: '#ffffff',
  fillOpacity: 0,
  inheritCustomCss: false,
  opacity: 1,
  radius: 0,
  shadow: 5,
  shadowAngle: 45,
  shadowBlur: 18,
  shadowColor: '#222222',
  shadowDistance: 6,
  strokeColor: '#111111',
  strokeOpacity: 1,
  strokeStyle: 'solid',
  strokeWidth: 4,
};

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings: {
        diamond: rectangleSettings,
        ellipse: rectangleSettings,
        rectangle: rectangleSettings,
      },
      updateSelectionShapeSettings: mocks.updateSelectionShapeSettings,
    }),
  },
}));

import { syncSelectionToolSettingsFromObject } from './sync';

describe('shape selection shadow sync', () => {
  it('syncs canonical shape shadow metadata and fallback values', () => {
    const rect = new Rect({ fill: '#ffffff', stroke: '#f97316', strokeWidth: 8 });
    rect.sniptaleRole = 'annotation';
    rect.sniptaleType = 'rectangle';
    rect.sniptaleShapeShadow = 40;
    rect.sniptaleShapeShadowAngle = 135;
    rect.sniptaleShapeShadowBlur = 24;
    rect.sniptaleShapeShadowColor = '#333333';
    rect.sniptaleShapeShadowDistance = 9;

    syncSelectionToolSettingsFromObject(rect, 'rectangle');
    syncSelectionToolSettingsFromObject({ fill: '#ffffff', stroke: '#f97316' } as never, 'diamond');

    expect(mocks.updateSelectionShapeSettings).toHaveBeenCalledWith(
      'rectangle',
      expect.objectContaining({
        shadow: 40,
        shadowAngle: 135,
        shadowBlur: 24,
        shadowColor: '#333333',
        shadowDistance: 9,
      })
    );
    expect(mocks.updateSelectionShapeSettings).toHaveBeenLastCalledWith(
      'rectangle',
      expect.objectContaining({
        shadow: 5,
        shadowAngle: 45,
        shadowBlur: 18,
        shadowColor: '#222222',
        shadowDistance: 6,
      })
    );
  });
});
