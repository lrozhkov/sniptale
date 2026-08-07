import { describe, expect, it } from 'vitest';
import { getLineConnectorState } from './line-connector';

const base = {
  anchorPoint: { x: 80, y: 0 },
  blockBoundaryWidth: 2,
  blockMarker: 'none' as const,
  blockMarkerSize: 10,
  bubbleRect: { x: 200, y: 200, width: 200, height: 80 },
  frameBoundaryWidth: 2,
  frameMarker: 'none' as const,
  frameMarkerSize: 10,
  frameRect: { x: 0, y: 0, width: 160, height: 100 },
  lineWidth: 2,
  preferredSide: 'top' as const,
  routing: 'elbow' as const,
  wedgeSize: 8,
};

describe('perpendicular elbow route control', () => {
  it('uses the normal-ray intersection instead of an unnecessary three-corner detour', () => {
    const line = getLineConnectorState({
      ...base,
      placement: {
        anchor: 'top-center',
        connectorBasePosition: 100 / 560,
        connectorFramePosition: 210 / 520,
        side: 'top',
      },
    });

    expect(line.routePoints).toEqual([
      { x: 300, y: 200 },
      { x: 300, y: 50 },
      { x: 160, y: 50 },
    ]);
    expect(line.routeControlAxis).toBe('both');
    expect(line.routeControlPoint).toEqual({ x: 300, y: 50 });
  });

  it('keeps the real corner draggable after a manual route collapses to one bend', () => {
    const line = getLineConnectorState({
      ...base,
      placement: {
        anchor: 'top-center',
        connectorBasePosition: 100 / 560,
        connectorFramePosition: 210 / 520,
        connectorWaypoint: { centerOffsetX: 220, centerOffsetY: 0 },
        side: 'top',
      },
    });

    expect(line.routePoints).toEqual([
      { x: 300, y: 200 },
      { x: 300, y: 50 },
      { x: 160, y: 50 },
    ]);
    expect(line.routeControlAxis).toBe('both');
    expect(line.routeControlPoint).toEqual({ x: 300, y: 50 });
  });

  it('clamps an out-of-range manual corner without dropping its drag control', () => {
    const line = getLineConnectorState({
      ...base,
      placement: {
        anchor: 'top-center',
        connectorBasePosition: 100 / 560,
        connectorFramePosition: 210 / 520,
        connectorWaypoint: { centerOffsetX: -1_000, centerOffsetY: 1_000 },
        side: 'top',
      },
    });

    expect(line.routePoints).toEqual([
      { x: 300, y: 200 },
      { x: 160, y: 200 },
      { x: 160, y: 50 },
    ]);
    expect(line.routeControlAxis).toBe('both');
    expect(line.routeControlPoint).toEqual({ x: 160, y: 200 });
  });

  it('routes through a moved control while retaining normal endpoint segments', () => {
    const line = getLineConnectorState({
      ...base,
      placement: {
        anchor: 'top-center',
        connectorBasePosition: 100 / 560,
        connectorFramePosition: 210 / 520,
        connectorWaypoint: { centerOffsetX: 140, centerOffsetY: 100 },
        side: 'top',
      },
    });

    expect(line.routePoints).toEqual([
      { x: 300, y: 200 },
      { x: 300, y: 150 },
      { x: 220, y: 150 },
      { x: 220, y: 50 },
      { x: 160, y: 50 },
    ]);
    expect(line.routeControlAxis).toBe('both');
    expect(line.routeControlPoint).toEqual({ x: 220, y: 150 });
  });
});
