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

  it('centers corner handles on the canonical outer-frame intersections', () => {
    expect(getResizeHandleStyle('nw', frame, 12)).toEqual({ left: 94, top: 44 });
    expect(getResizeHandleStyle('se', frame, 12)).toEqual({ left: 294, top: 144 });
  });

  it('centers side handles on the canonical edge and its midpoint', () => {
    expect(getResizeHandleStyle('n', frame, 12)).toEqual({ left: 194, top: 44 });
    expect(getResizeHandleStyle('e', frame, 12)).toEqual({ left: 294, top: 94 });
  });

  it('keeps handle positions independent from stroke thickness and decoration visibility', () => {
    const thickBlurFrame = createFrameDataFixture('frame-thick', {
      ...frame,
      effectMode: 'blur',
      blurSettings: { amount: 10, blurType: 'gaussian', showBorder: true },
      borderSettings: { ...frame.borderSettings!, width: 20 },
    });
    const hiddenBlurFrame = createFrameDataFixture('frame-hidden', {
      ...thickBlurFrame,
      blurSettings: { ...thickBlurFrame.blurSettings!, showBorder: false },
      borderSettings: { ...thickBlurFrame.borderSettings!, width: 1 },
    });

    expect(getResizeHandleStyle('nw', thickBlurFrame, 12)).toEqual(
      getResizeHandleStyle('nw', hiddenBlurFrame, 12)
    );
    expect(getResizeHandleStyle('se', thickBlurFrame, 12)).toEqual(
      getResizeHandleStyle('se', hiddenBlurFrame, 12)
    );
  });
});
