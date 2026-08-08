import { describe, expect, it } from 'vitest';
import { getPolylineRouteState, snapPolylineControlPoint } from './polyline-control';

const angleSnap = {
  fixedPoint: { x: 100, y: 150 },
  fixedSide: 'bottom' as const,
  railPoint: { x: 200, y: 100 },
  side: 'left' as const,
};

describe('angled callout connector route', () => {
  it('creates a normal landing segment followed by an automatic 45 degree segment', () => {
    const state = getPolylineRouteState({
      blockPoint: angleSnap.railPoint,
      blockSide: angleSnap.side,
      framePoint: angleSnap.fixedPoint,
      frameSide: angleSnap.fixedSide,
    });

    expect(state.route).toEqual([
      { x: 200, y: 100 },
      { x: 150, y: 100 },
      { x: 100, y: 150 },
    ]);
    expect(state.angle).toBe(45);
    expect(state.axis).toBe('both');
  });

  it('prefers a compact automatic landing over a remote 45 degree corner', () => {
    const state = getPolylineRouteState({
      blockPoint: { x: 146, y: 381 },
      blockSide: 'top',
      framePoint: { x: 323, y: 212 },
      frameSide: 'left',
    });

    expect(state.point).toEqual({ x: 146, y: 357 });
    expect(state.route).toEqual([
      { x: 146, y: 381 },
      { x: 146, y: 357 },
      { x: 323, y: 212 },
    ]);
    expect(Math.abs(state.route[1]!.y - state.route[0]!.y)).toBeLessThanOrEqual(96);
  });

  it('magnetically snaps ordinary movement to perpendicular endpoint rails', () => {
    expect(
      snapPolylineControlPoint({ point: { x: 106, y: 156 }, snap: angleSnap, strict: false })
    ).toEqual({ x: 100, y: 156 });
    const freePoint = snapPolylineControlPoint({
      point: { x: 130, y: 500 },
      snap: angleSnap,
      strict: false,
    });
    expect(freePoint).toEqual({ x: 130, y: 500 });
    const commentEntry = snapPolylineControlPoint({
      point: { x: 194, y: 106 },
      snap: angleSnap,
      strict: false,
    });
    expect(commentEntry).toEqual({ x: 194, y: 100 });
  });

  it('disables endpoint magnets for Ctrl-style free movement', () => {
    expect(
      snapPolylineControlPoint({
        disableMagnetism: true,
        point: { x: 106, y: 156 },
        snap: angleSnap,
        strict: false,
      })
    ).toEqual({ x: 106, y: 156 });
  });

  it('does not cap the distance of an explicitly dragged control point', () => {
    const snapped = snapPolylineControlPoint({
      point: { x: 1_400, y: 70 },
      snap: {
        fixedPoint: { x: 220, y: 118 },
        fixedSide: 'left',
        railPoint: { x: 132, y: 70 },
        side: 'right',
      },
      strict: false,
    });

    expect(snapped).toEqual({ x: 1_400, y: 70 });
  });

  it('renders a saved manual waypoint without applying automatic landing limits', () => {
    const state = getPolylineRouteState({
      blockPoint: { x: 132, y: 70 },
      blockSide: 'right',
      framePoint: { x: 220, y: 118 },
      frameSide: 'left',
      waypoint: { x: 1_400, y: 70 },
    });

    expect(state.point).toEqual({ x: 1_400, y: 70 });
    expect(state.axis).toBe('both');
    expect(state.route).toEqual([
      { x: 132, y: 70 },
      { x: 1_400, y: 70 },
      { x: 220, y: 118 },
    ]);
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
      frameSide: 'left',
    });

    expect(state.route).toEqual([
      { x: 100, y: 100 },
      { x: 120, y: 110 },
    ]);
    expect(state.point).toBeNull();
    expect(state.angleSnap).toBeNull();
  });
});
