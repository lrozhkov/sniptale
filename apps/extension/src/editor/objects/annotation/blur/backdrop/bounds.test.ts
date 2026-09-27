import { describe, expect, it } from 'vitest';
import { Point, Rect, util } from 'fabric';

import type { BlurRuntimeObject } from '../types';
import { resolveBackdropPadding, resolveBlurBounds } from './bounds';

function createBlurObject(overrides: Partial<BlurRuntimeObject> = {}): BlurRuntimeObject {
  return {
    height: 20,
    left: 10,
    top: 12,
    width: 40,
    ...overrides,
  } as BlurRuntimeObject;
}

describe('blur backdrop bounds owner', () => {
  it('maps the live scaled blur area back to the same scene pixels', () => {
    const object = new Rect({
      height: 20,
      left: 10,
      originX: 'left',
      originY: 'top',
      scaleX: 2,
      scaleY: 3,
      top: 12,
      width: 40,
    }) as BlurRuntimeObject;
    const bounds = resolveBlurBounds(object, 6);
    const viewportTransform = (
      bounds as typeof bounds & { viewportTransform: ReturnType<Rect['calcTransformMatrix']> }
    ).viewportTransform;
    const topLeft = util.transformPoint(new Point(-20, -10), object.calcTransformMatrix());
    const bottomRight = util.transformPoint(new Point(20, 10), object.calcTransformMatrix());

    expect(viewportTransform).toBeDefined();
    expect(util.transformPoint(topLeft, viewportTransform).x).toBeCloseTo(6);
    expect(util.transformPoint(topLeft, viewportTransform).y).toBeCloseTo(6);
    expect(util.transformPoint(bottomRight, viewportTransform).x).toBeCloseTo(46);
    expect(util.transformPoint(bottomRight, viewportTransform).y).toBeCloseTo(26);
  });

  it('maps every rotated corner to its own capture corner', () => {
    const object = new Rect({
      angle: 28,
      height: 20,
      left: 110,
      originX: 'left',
      originY: 'top',
      top: 72,
      width: 40,
    }) as BlurRuntimeObject;
    const bounds = resolveBlurBounds(object, 8);
    const viewportTransform = (
      bounds as typeof bounds & { viewportTransform: ReturnType<Rect['calcTransformMatrix']> }
    ).viewportTransform;
    const localCorners = [
      { local: new Point(-20, -10), capture: new Point(8, 8) },
      { local: new Point(20, -10), capture: new Point(48, 8) },
      { local: new Point(20, 10), capture: new Point(48, 28) },
      { local: new Point(-20, 10), capture: new Point(8, 28) },
    ];

    for (const corner of localCorners) {
      const scenePoint = util.transformPoint(corner.local, object.calcTransformMatrix());
      const capturePoint = util.transformPoint(scenePoint, viewportTransform);
      expect(capturePoint.x).toBeCloseTo(corner.capture.x);
      expect(capturePoint.y).toBeCloseTo(corner.capture.y);
    }
  });

  it('keeps capture geometry finite while a resize passes through zero scale', () => {
    const object = new Rect({
      height: 20,
      left: 10,
      originX: 'left',
      originY: 'top',
      scaleX: 0,
      top: 12,
      width: 40,
    }) as BlurRuntimeObject;

    expect(resolveBlurBounds(object, 6).viewportTransform).toEqual([1, 0, 0, 1, -4, -6]);
  });

  it('resolves effect-specific backdrop padding', () => {
    expect(resolveBackdropPadding({ amount: 5, blurType: 'gaussian', showBorder: false })).toBe(15);
    expect(resolveBackdropPadding({ amount: 4, blurType: 'distortion', showBorder: false })).toBe(
      6
    );
    expect(resolveBackdropPadding({ amount: 9, blurType: 'pixelate', showBorder: false })).toBe(0);
    expect(resolveBackdropPadding({ amount: 9, blurType: 'solid', showBorder: false })).toBe(0);
  });

  it('builds padded capture bounds from the inner blur area', () => {
    expect(resolveBlurBounds(createBlurObject(), 6)).toMatchObject({
      height: 20,
      left: 4,
      paddedHeight: 32,
      paddedWidth: 52,
      top: 6,
      width: 40,
    });

    expect(
      resolveBlurBounds(createBlurObject({ showBorder: true, strokeWidth: 4 } as never), 2)
    ).toEqual(expect.objectContaining({ height: 20, width: 40 }));
  });
});
