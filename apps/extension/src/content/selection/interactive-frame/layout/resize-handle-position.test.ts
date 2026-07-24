import { describe, expect, it } from 'vitest';
import { createFrameDataFixture } from '../../frame-runtime/test-support';
import { getResizeHandleStyle } from './resize-handle-position';

describe('getResizeHandleStyle', () => {
  const frame = createFrameDataFixture('frame-1', {
    x: 100,
    y: 50,
    width: 200,
    height: 100,
  });

  it('centers corner handles on the frame-line intersections', () => {
    expect(getResizeHandleStyle('nw', frame, 12, 4)).toEqual({ left: 96, top: 46 });
    expect(getResizeHandleStyle('se', frame, 12, 4)).toEqual({ left: 300, top: 150 });
  });

  it('centers side handles on both the side line and the edge midpoint', () => {
    expect(getResizeHandleStyle('n', frame, 12, 4)).toEqual({ left: 198, top: 46 });
    expect(getResizeHandleStyle('e', frame, 12, 4)).toEqual({ left: 300, top: 98 });
  });
});
