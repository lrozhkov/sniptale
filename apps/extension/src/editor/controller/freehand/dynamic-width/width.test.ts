import { describe, expect, it } from 'vitest';
import type { EditorBrushSettings } from '../../../../features/editor/document/types';
import { stabilizeEndpointWidths } from './width/endpoints';
import { resolveDynamicWidthPoints } from './width/points';

const settings: EditorBrushSettings = {
  color: '#ff0000',
  dynamicWidth: true,
  opacity: 1,
  shapeCorrection: 'off',
  shadow: 0,
  smoothingLevel: 0,
  width: 10,
};

describe('editor-controller freehand dynamic-width width seam', () => {
  it('normalizes missing or mismatched samples from the point list', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
    ];

    expect(resolveDynamicWidthPoints(points, settings, null)).toHaveLength(2);
    expect(resolveDynamicWidthPoints(points, settings, [{ t: 0, x: 0, y: 0 }])).toHaveLength(2);
  });

  it('keeps single-point widths finite and preserves zero-length strokes', () => {
    expect(resolveDynamicWidthPoints([{ x: 0, y: 0 }], settings, null)).toEqual([
      expect.objectContaining({ width: expect.any(Number), x: 0, y: 0 }),
    ]);
    expect(
      stabilizeEndpointWidths([
        { width: 3, x: 0, y: 0 },
        { width: 8, x: 0, y: 0 },
      ])
    ).toEqual([
      { width: 3, x: 0, y: 0 },
      { width: 8, x: 0, y: 0 },
    ]);
  });
});
