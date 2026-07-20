import { describe, expect, it } from 'vitest';
import { resolvePairForRightWing, resolveWingMetrics } from './arrow-wing-candidates';

function createLeftMetrics() {
  const leftMetrics = resolveWingMetrics({
    maxHeadLength: 50,
    minHeadLength: 2,
    shaftEnd: { x: 96, y: 0 },
    shaftStart: { x: 0, y: 0 },
    wing: { x: 74, y: -18 },
  });

  if (!leftMetrics) {
    throw new Error('Expected left wing metrics');
  }

  return leftMetrics;
}

function createPairInput(rightWing: { x: number; y: number }) {
  const leftMetrics = createLeftMetrics();
  return {
    leftAngle: leftMetrics.angle,
    leftIndex: 5,
    leftLength: leftMetrics.length,
    leftSign: leftMetrics.sign,
    leftWing: { x: 74, y: -18 },
    maxHeadLength: 50,
    minHeadLength: 2,
    rightWing,
    shaftEnd: { x: 96, y: 0 },
    shaftStart: { x: 0, y: 0 },
  };
}

function createPositiveLeftPairInput() {
  const leftMetrics = resolveWingMetrics({
    maxHeadLength: 50,
    minHeadLength: 2,
    shaftEnd: { x: 96, y: 0 },
    shaftStart: { x: 0, y: 0 },
    wing: { x: 74, y: 18 },
  });

  if (!leftMetrics) {
    throw new Error('Expected positive left wing metrics');
  }

  return {
    leftAngle: leftMetrics.angle,
    leftIndex: 6,
    leftLength: leftMetrics.length,
    leftSign: leftMetrics.sign,
    leftWing: { x: 74, y: 18 },
    maxHeadLength: 50,
    minHeadLength: 2,
    rightWing: { x: 72, y: -18 },
    shaftEnd: { x: 96, y: 0 },
    shaftStart: { x: 0, y: 0 },
  };
}

describe('editor-controller freehand arrow wing candidate owner', () => {
  it('measures valid wing geometry and rejects invalid lengths', () => {
    expect(createLeftMetrics()).toEqual(
      expect.objectContaining({ angle: expect.any(Number), sign: expect.any(Number) })
    );
    expect(
      resolveWingMetrics({
        maxHeadLength: 10,
        minHeadLength: 2,
        shaftEnd: { x: 96, y: 0 },
        shaftStart: { x: 0, y: 0 },
        wing: { x: 0, y: -40 },
      })
    ).toBeNull();
    expect(
      resolveWingMetrics({
        maxHeadLength: 50,
        minHeadLength: 2,
        shaftEnd: { x: 96, y: 0 },
        shaftStart: { x: 0, y: 0 },
        wing: { x: 95.6, y: 0.2 },
      })
    ).toBeNull();
    expect(
      resolveWingMetrics({
        maxHeadLength: 50,
        minHeadLength: 2,
        shaftEnd: { x: 96, y: 0 },
        shaftStart: { x: 0, y: 0 },
        wing: { x: 74, y: 0 },
      })
    ).toBeNull();
  });

  it('builds a canonical opposite-wing pair only when symmetry is sufficient', () => {
    expect(resolvePairForRightWing(createPairInput({ x: 72, y: 18 }))).toEqual(
      expect.objectContaining({ headStartIndex: 5 })
    );
    expect(resolvePairForRightWing(createPairInput({ x: 70, y: -14 }))).toBeNull();
    expect(resolvePairForRightWing(createPositiveLeftPairInput())).toEqual(
      expect.objectContaining({ headStartIndex: 6 })
    );
  });
});
