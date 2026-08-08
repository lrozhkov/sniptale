import { describe, expect, it } from 'vitest';
import { getLineConnectorState } from './line-connector';

const base = {
  anchorPoint: { x: 180, y: 100 },
  blockBoundaryWidth: 2,
  blockMarker: 'none' as const,
  blockMarkerSize: 10,
  bubbleRect: { x: 120, y: 20, width: 120, height: 48 },
  frameBoundaryWidth: 4,
  frameMarker: 'none' as const,
  frameMarkerSize: 10,
  frameRect: { x: 100, y: 100, width: 160, height: 120 },
  lineWidth: 2,
  placement: { anchor: 'top-center', side: 'top' } as const,
  preferredSide: 'top' as const,
  wedgeSize: 8,
};

function expectAngle(actual: number, expected: number) {
  const delta = ((actual - expected + 540) % 360) - 180;
  expect(delta).toBeCloseTo(0);
}

describe('line callout connector', () => {
  it('builds separate straight and orthogonal elbow routes', () => {
    const placement = {
      ...base.placement,
      connectorBasePosition: 228 / 336,
      connectorFramePosition: 140 / 560,
    };
    const straight = getLineConnectorState({ ...base, placement, routing: 'straight' });
    const elbow = getLineConnectorState({ ...base, placement, routing: 'elbow' });
    expect(straight.path.match(/L/g)).toHaveLength(1);
    expect(elbow.path.match(/L/g)!.length).toBeGreaterThan(1);
    expect(elbow.framePoint).toEqual(straight.framePoint);
  });

  it('collapses a short aligned elbow route into one straight segment', () => {
    const line = getLineConnectorState({ ...base, routing: 'elbow' });

    expect(line.routePoints).toEqual([
      { x: 180, y: 68 },
      { x: 180, y: 100 },
    ]);
    expect(line.routeControlAxis).toBeNull();
    expect(line.routeControlPoint).toBeNull();
  });

  it('builds an angled route with a draggable normal landing segment', () => {
    const line = getLineConnectorState({
      ...base,
      placement: {
        ...base.placement,
        connectorBasePosition: 144 / 336,
        connectorFramePosition: 80 / 560,
      },
      routing: 'polyline',
    });

    expect(line.routePoints).toHaveLength(3);
    expect(line.routePoints[0]?.y).toBe(line.routePoints[1]?.y);
    expect(line.routeControlAxis).toBe('both');
    expect(line.routeControlAngle).not.toBeNull();
    expect(line.routeControlAngleSnap).not.toBeNull();
  });

  it('keeps a moved angled-route control at its explicit free position', () => {
    const line = getLineConnectorState({
      ...base,
      placement: {
        ...base.placement,
        connectorBasePosition: 144 / 336,
        connectorFramePosition: 80 / 560,
        connectorWaypoint: { centerOffsetX: 180, centerOffsetY: -160 },
      },
      routing: 'polyline',
    });

    expect(line.routePoints).toHaveLength(3);
    expect(line.routeControlAxis).toBe('both');
    expect(line.routeControlPoint).toEqual({ x: 360, y: 0 });
    expect(line.routePoints[1]).toEqual({ x: 360, y: 0 });
  });

  it('uses a movable safe channel for parallel offset endpoints', () => {
    const placement = {
      ...base.placement,
      connectorBasePosition: 30 / 336,
      connectorFramePosition: 120 / 560,
      connectorWaypoint: { centerOffsetX: 0, centerOffsetY: -100 },
    };
    const line = getLineConnectorState({ ...base, placement, routing: 'elbow' });

    expect(line.routeControlAxis).toBe('y');
    expect(line.routePoints).toEqual([
      { x: 150, y: 20 },
      { x: 150, y: 4 },
      { x: 220, y: 4 },
      { x: 220, y: 100 },
    ]);
    expect(line.routeControlPoint).toEqual({ x: 185, y: 4 });
  });

  it('uses a single corner when perpendicular endpoint sides have a clear route', () => {
    const line = getLineConnectorState({
      ...base,
      placement: {
        ...base.placement,
        connectorBasePosition: 144 / 336,
        connectorFramePosition: 160 / 560,
      },
      routing: 'elbow',
    });

    expect(line.routePoints).toEqual([
      { x: 240, y: 44 },
      { x: 260, y: 44 },
      { x: 260, y: 100 },
    ]);
    expect(line.routeControlAxis).toBe('both');
    expect(line.routeControlPoint).toEqual({ x: 260, y: 44 });
  });

  it('returns endpoint angles aligned with adjacent route segments', () => {
    const line = getLineConnectorState({ ...base, routing: 'straight' });
    expect(Number.isFinite(line.blockAngle)).toBe(true);
    expectAngle(line.frameAngle, line.blockAngle + 180);
  });

  it('places both line endpoints anywhere on their complete perimeters', () => {
    const line = getLineConnectorState({
      ...base,
      placement: {
        ...base.placement,
        connectorBasePosition: 0.5,
        connectorFramePosition: 440 / 560,
      },
      routing: 'straight',
    });

    expect(line.attachment.bubbleEdgePoint).toEqual({ x: 240, y: 68 });
    expect(line.attachment.framePoint).toEqual({ x: 100, y: 220 });
  });

  it('approaches manually positioned frame ports by the boundary normal', () => {
    const line = getLineConnectorState({
      ...base,
      placement: {
        ...base.placement,
        connectorBasePosition: 228 / 336,
        connectorFramePosition: 540 / 560,
      },
      routing: 'elbow',
    });

    expect(line.attachment.bubbleEdgePoint).toEqual({ x: 180, y: 68 });
    expect(line.attachment.framePoint).toEqual({ x: 100, y: 120 });
    expectAngle(line.blockAngle, -90);
    expectAngle(line.frameAngle, 0);
  });

  it.each([
    { blockPosition: 60 / 336, blockAngle: 90, framePosition: 80 / 560, frameAngle: 90 },
    { blockPosition: 144 / 336, blockAngle: 180, framePosition: 220 / 560, frameAngle: 180 },
    { blockPosition: 228 / 336, blockAngle: -90, framePosition: 360 / 560, frameAngle: -90 },
    { blockPosition: 312 / 336, blockAngle: 0, framePosition: 500 / 560, frameAngle: 0 },
  ])(
    'keeps first and last elbow segments normal at perimeter ports %#',
    ({ blockAngle, blockPosition, frameAngle, framePosition }) => {
      const line = getLineConnectorState({
        ...base,
        placement: {
          ...base.placement,
          connectorBasePosition: blockPosition,
          connectorFramePosition: framePosition,
        },
        routing: 'elbow',
      });

      expectAngle(line.blockAngle, blockAngle);
      expectAngle(line.frameAngle, frameAngle);
    }
  );

  it('routes aligned ports that face away through an exterior channel', () => {
    const line = getLineConnectorState({
      ...base,
      placement: {
        ...base.placement,
        connectorBasePosition: 60 / 336,
        connectorFramePosition: 80 / 560,
      },
      routing: 'elbow',
    });

    expect(line.routePoints.some((point) => point.x <= 84 || point.x >= 276)).toBe(true);
    expectAngle(line.blockAngle, 90);
    expectAngle(line.frameAngle, 90);
  });

  it('orients both elbow arrowheads toward their owning elements', () => {
    const line = getLineConnectorState({
      ...base,
      blockMarker: 'arrow',
      frameMarker: 'arrow',
      placement: {
        ...base.placement,
        connectorBasePosition: 228 / 336,
        connectorFramePosition: 540 / 560,
      },
      routing: 'elbow',
    });

    expectAngle(line.blockAngle, -90);
    expectAngle(line.frameAngle, 0);
  });
});
