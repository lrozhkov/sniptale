import { describe, expect, it } from 'vitest';
import { Rect } from 'fabric';

import { applyShapeSettings, normalizeScaledRectangleTarget } from './shape-style';

const settings = {
  borderPresetId: null,
  customCss: '',
  fillColor: '#ffffff',
  fillOpacity: 1,
  inheritCustomCss: false,
  opacity: 1,
  radius: 6,
  shadow: 10,
  shadowAngle: 180,
  shadowBlur: 20,
  shadowColor: '#123456',
  shadowDistance: 8,
  strokeColor: '#f97316',
  strokeOpacity: 1,
  strokeStyle: 'solid',
  strokeWidth: 4,
} as const;

describe('shape-style rectangle normalization', () => {
  it('normalizes scaled annotation rectangles and preserves canonical shadow metadata', () => {
    const rect = new Rect({ height: 20, left: 10, scaleX: -2, scaleY: 0, top: 20, width: 40 });
    rect.sniptaleRole = 'annotation';
    rect.sniptaleType = 'rectangle';
    rect.sniptaleShapeRadius = Number.NaN;
    rect.ry = 5;

    expect(normalizeScaledRectangleTarget(rect)).toBe(true);
    applyShapeSettings(rect, 'rectangle', settings);

    expect(rect.scaleX).toBe(1);
    expect(rect.scaleY).toBe(1);
    expect(rect.sniptaleShapeShadowAngle).toBe(180);
    expect(rect.sniptaleShapeShadowBlur).toBe(20);
    expect(rect.sniptaleShapeShadowColor).toBe('#123456');
    expect(rect.sniptaleShapeShadowDistance).toBe(8);
  });

  it('ignores non-annotation rectangles and unscaled annotation rectangles', () => {
    const rect = new Rect({ height: 20, scaleX: 1, scaleY: 1, width: 40 });
    expect(normalizeScaledRectangleTarget(rect)).toBe(false);
    rect.sniptaleRole = 'annotation';
    rect.sniptaleType = 'rectangle';
    expect(normalizeScaledRectangleTarget(rect)).toBe(false);
  });
});
