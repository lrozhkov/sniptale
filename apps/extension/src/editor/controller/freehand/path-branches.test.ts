import { describe, expect, it, vi } from 'vitest';

import { applyFreehandSettingsToObject } from './path';

const settings = {
  color: '#f97316',
  dynamicWidth: false,
  opacity: 1,
  shapeCorrection: 'subtle',
  shadow: 0,
  smoothingLevel: 0,
  width: 4,
} as const;

describe('freehand path branch coverage', () => {
  it('applies style to non-Path freehand objects without coordinate hooks', () => {
    const object = {
      sniptaleBrushPointsJson: '[{"x":1,"y":2},{"x":3,"y":4}]',
      sniptaleType: 'highlighter',
      set: vi.fn(function setValues(
        this: Record<string, unknown>,
        values: Record<string, unknown>
      ) {
        Object.assign(this, values);
      }),
    };

    applyFreehandSettingsToObject(object as never, settings);

    expect(object.set).toHaveBeenCalledWith(
      expect.objectContaining({
        stroke: 'rgba(249, 115, 22, 1)',
        strokeWidth: 4,
      })
    );
  });
});
