import { describe, expect, it } from 'vitest';
import { getPolylineRouteState, snapPolylineControlPoint } from './polyline-control';

const angleSnap = {
  fixedPoint: { x: 100, y: 150 },
  railPoint: { x: 200, y: 100 },
  side: 'left' as const,
};

describe('angled callout connector route', () => {
  it('creates a normal landing segment followed by an automatic 45 degree segment', () => {
    const state = getPolylineRouteState({
      blockPoint: angleSnap.railPoint,
      blockSide: angleSnap.side,
      framePoint: angleSnap.fixedPoint,
    });

    expect(state.route).toEqual([
      { x: 200, y: 100 },
      { x: 150, y: 100 },
      { x: 100, y: 150 },
    ]);
    expect(state.angle).toBe(45);
    expect(state.axis).toBe('x');
  });

  it('keeps the control on the outward rail and softly attracts it to common angles', () => {
    expect(
      snapPolylineControlPoint({ point: { x: 154, y: 500 }, snap: angleSnap, strict: false })
    ).toEqual({ x: 150, y: 100 });
    const snappedThirty = snapPolylineControlPoint({
      point: { x: 130, y: 500 },
      snap: angleSnap,
      strict: false,
    });
    expect(snappedThirty.x).toBeCloseTo(128.87, 2);
    expect(snappedThirty.y).toBe(100);
    const constrainedInward = snapPolylineControlPoint({
      point: { x: 250, y: 500 },
      snap: angleSnap,
      strict: false,
    });
    expect(constrainedInward.x).toBeLessThanOrEqual(192);
    expect(constrainedInward.y).toBe(100);
  });

  it('uses 15 degree angle steps while Shift snapping is active', () => {
    const point = snapPolylineControlPoint({
      point: { x: 133, y: 100 },
      snap: angleSnap,
      strict: true,
    });
    const angle = Math.round(
      (Math.atan2(
        Math.abs(angleSnap.fixedPoint.y - point.y),
        Math.abs(angleSnap.fixedPoint.x - point.x)
      ) *
        180) /
        Math.PI
    );

    expect(angle % 15).toBe(0);
  });

  it('collapses a short automatic route into a direct segment', () => {
    const state = getPolylineRouteState({
      blockPoint: { x: 100, y: 100 },
      blockSide: 'right',
      framePoint: { x: 120, y: 110 },
    });

    expect(state.route).toEqual([
      { x: 100, y: 100 },
      { x: 120, y: 110 },
    ]);
    expect(state.point).toBeNull();
    expect(state.angleSnap).toBeNull();
  });
});
