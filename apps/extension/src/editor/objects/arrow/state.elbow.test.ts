import { describe, expect, it } from 'vitest';
import { resolveArrowUpdatePoints } from './state';

const elbowSettings = {
  arrowType: 'elbow',
  color: '#111',
  endHead: 'triangle',
  mode: 'straight',
  opacity: 1,
  shadow: 0,
  startHead: 'none',
  variant: 'standard',
  width: 4,
} as const;

describe('object-factory arrow elbow state', () => {
  it('stores authored elbow waypoints instead of normalized render route points', () => {
    expect(
      resolveArrowUpdatePoints([], elbowSettings, {
        points: [
          { x: 0, y: 0 },
          { x: 30, y: 20 },
          { x: 60, y: 20 },
        ],
      })
    ).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 20 },
      { x: 60, y: 20 },
    ]);
  });

  it('keeps a collapsed elbow draft drawable by preserving two endpoint records', () => {
    expect(
      resolveArrowUpdatePoints([], elbowSettings, {
        points: [{ x: 12, y: 14 }],
      })
    ).toEqual([
      { x: 12, y: 14 },
      { x: 12, y: 14 },
    ]);
  });
});
