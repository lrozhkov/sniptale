import { describe, expect, it } from 'vitest';
import { createModeledFreehandStroke } from './modeling';

describe('editor-controller freehand modeling seam', () => {
  it('returns null for degenerate or fully duplicated strokes', () => {
    expect(
      createModeledFreehandStroke([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ])
    ).toBeNull();
  });

  it('builds open modeled strokes with deduped points and sampled centerline', () => {
    const modeledStroke = createModeledFreehandStroke([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 18, y: 6 },
      { x: 42, y: 8 },
      { x: 68, y: 0 },
    ]);

    expect(modeledStroke).toMatchObject({
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: 18, y: 6 },
        { x: 42, y: 8 },
        { x: 68, y: 0 },
      ],
    });
    expect(modeledStroke?.sampledPoints.length).toBeGreaterThanOrEqual(24);
  });

  it('builds closed modeled strokes without keeping the duplicate closing point in the centerline', () => {
    const modeledStroke = createModeledFreehandStroke([
      { x: 10, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 24 },
      { x: 10, y: 24 },
      { x: 10, y: 0 },
    ]);

    expect(modeledStroke?.closed).toBe(true);
    expect(modeledStroke?.centerline).toEqual([
      { x: 10, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 24 },
      { x: 10, y: 24 },
    ]);
  });
});
