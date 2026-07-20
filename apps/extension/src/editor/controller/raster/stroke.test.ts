import { describe, expect, it } from 'vitest';
import { sampleRasterStrokePoints } from './stroke';

describe('editor-controller/raster/stroke', () => {
  it('samples continuous points between sparse pointer positions', () => {
    expect(
      sampleRasterStrokePoints([
        { x: 1, y: 2 },
        { x: 4, y: 2 },
      ])
    ).toEqual([
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
    ]);
  });
});
