import { describe, expect, it } from 'vitest';
import { getLineConnectorState } from './line-connector';

const base = {
  anchorPoint: { x: 180, y: 100 },
  bubbleRect: { x: 120, y: 20, width: 120, height: 48 },
  frameRect: { x: 100, y: 100, width: 160, height: 120 },
  placement: { anchor: 'top-center', side: 'top' } as const,
  preferredSide: 'top' as const,
  wedgeSize: 8,
};

describe('line callout connector', () => {
  it('builds separate straight and orthogonal elbow routes', () => {
    const straight = getLineConnectorState({ ...base, routing: 'straight' });
    const elbow = getLineConnectorState({ ...base, routing: 'elbow' });
    expect(straight.path.match(/L/g)).toHaveLength(1);
    expect(elbow.path.match(/L/g)).toHaveLength(2);
    expect(elbow.framePoint).toEqual(straight.framePoint);
  });

  it('returns endpoint angles aligned with adjacent route segments', () => {
    const line = getLineConnectorState({ ...base, routing: 'straight' });
    expect(Number.isFinite(line.blockAngle)).toBe(true);
    expect(line.frameAngle).toBeCloseTo(line.blockAngle);
  });
});
