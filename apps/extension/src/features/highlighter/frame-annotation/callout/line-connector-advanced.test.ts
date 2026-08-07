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

describe('advanced line connector geometry', () => {
  it('creates an automatic bezier route and exposes its two tangent handles', () => {
    const line = getLineConnectorState({
      ...base,
      routing: 'curve',
      curve: { curvature: 0.6, mode: 'auto' },
    });

    expect(line.path).toContain(' C ');
    expect(line.curveHandles?.start).toBeTruthy();
    expect(line.curveHandles?.end).toBeTruthy();
    expect(line.routeControlPoint).toBeNull();
  });

  it('uses manual curve handles as endpoint-relative offsets', () => {
    const line = getLineConnectorState({
      ...base,
      routing: 'curve',
      curve: {
        curvature: 0.35,
        endHandle: { x: 24, y: -18 },
        mode: 'manual',
        startHandle: { x: -16, y: 22 },
      },
    });

    expect(line.curveHandles?.start).toEqual({
      x: line.routePoints[0]!.x - 16,
      y: line.routePoints[0]!.y + 22,
    });
    expect(line.curveHandles?.end).toEqual({
      x: line.routePoints.at(-1)!.x + 24,
      y: line.routePoints.at(-1)!.y - 18,
    });
  });

  it('moves either curve handle independently while the other remains automatic', () => {
    const line = getLineConnectorState({
      ...base,
      routing: 'curve',
      curve: {
        curvature: 0.35,
        mode: 'manual',
        startHandle: { x: 18, y: -12 },
      },
    });

    expect(line.curveHandles?.start).toEqual({
      x: line.routePoints[0]!.x + 18,
      y: line.routePoints[0]!.y - 12,
    });
    expect(line.curveHandles?.end).toBeTruthy();
  });

  it('applies independent endpoint gaps without moving visual attachment anchors', () => {
    const line = getLineConnectorState({
      ...base,
      routing: 'straight',
      spacing: { blockGap: 7, frameGap: 11, minimumEndSegment: 16, obstacleMargin: 0 },
    });

    expect(line.attachment.bubbleEdgePoint).toEqual({ x: 180, y: 68 });
    expect(line.attachment.framePoint).toEqual({ x: 180, y: 100 });
    expect(line.routePoints).toEqual([
      { x: 180, y: 75 },
      { x: 180, y: 89 },
    ]);
  });

  it('rounds orthogonal corners while keeping sharp mode unchanged', () => {
    const placement = {
      ...base.placement,
      connectorBasePosition: 144 / 336,
      connectorFramePosition: 160 / 560,
    };
    const sharp = getLineConnectorState({ ...base, placement, routing: 'elbow' });
    const rounded = getLineConnectorState({
      ...base,
      cornerStyle: { kind: 'rounded', radius: 200 },
      placement,
      routing: 'elbow',
    });

    expect(sharp.path).not.toContain(' Q ');
    expect(rounded.path).toContain(' Q ');
    expect(rounded.routePoints).toEqual(sharp.routePoints);
  });
});
