import { describe, expect, it } from 'vitest';

import { buildArrowCenterline } from './centerline';
import { buildTaperedArrowOutline } from './tapered-outline';
import { buildPolylineLengthState, getSmoothedPolylineSample } from './tapered-polyline';
import { TAPERED_HEAD_OUTLINE_POINT_COUNT, TAPERED_SHAFT_SAMPLE_COUNT } from './tapered-template';

const baseSettings = {
  color: '#f60',
  endHead: 'triangle' as const,
  mode: 'straight' as const,
  opacity: 1,
  shadow: 0,
  startHead: 'none' as const,
  variant: 'tapered' as const,
  width: 6,
};

function getTipIndex(points: Array<{ x: number; y: number }>): number {
  return Math.floor(points.length / 2);
}

function getHeadBaseUpperIndex(): number {
  return TAPERED_SHAFT_SAMPLE_COUNT;
}

function getHeadBaseLowerIndex(points: Array<{ x: number; y: number }>): number {
  return points.length - 1 - TAPERED_SHAFT_SAMPLE_COUNT;
}

function getHeadLength(points: Array<{ x: number; y: number }>): number {
  const base = points[getHeadBaseUpperIndex()];
  const tip = points[getTipIndex(points)];

  return Math.hypot((tip?.x ?? 0) - (base?.x ?? 0), (tip?.y ?? 0) - (base?.y ?? 0));
}

function getHeadSpan(points: Array<{ x: number; y: number }>): number {
  const baseUpper = points[getHeadBaseUpperIndex()];
  const baseLower = points[getHeadBaseLowerIndex(points)];

  return Math.hypot(
    (baseUpper?.x ?? 0) - (baseLower?.x ?? 0),
    (baseUpper?.y ?? 0) - (baseLower?.y ?? 0)
  );
}

function getMaxHeadSpan(points: Array<{ x: number; y: number }>): number {
  const tipIndex = getTipIndex(points);
  let maxSpan = 0;

  for (let index = getHeadBaseUpperIndex(); index < tipIndex; index += 1) {
    const upper = points[index];
    const lower = points[points.length - 1 - index];
    const span = Math.hypot((upper?.x ?? 0) - (lower?.x ?? 0), (upper?.y ?? 0) - (lower?.y ?? 0));
    maxSpan = Math.max(maxSpan, span);
  }

  return maxSpan;
}

function registerCappedHeadTest() {
  it('keeps straight-arrow heads compact after the width-driven cap is reached', () => {
    const medium = buildTaperedArrowOutline(
      [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
      ],
      {
        ...baseSettings,
        width: 18,
      }
    );
    const long = buildTaperedArrowOutline(
      [
        { x: 0, y: 0 },
        { x: 320, y: 0 },
      ],
      {
        ...baseSettings,
        width: 18,
      }
    );

    expect(Math.abs(getHeadLength(long) - getHeadLength(medium))).toBeLessThan(2);
  });
}

function registerRigidHeadShoulderTest() {
  it('keeps the rigid head widest at its shoulders instead of bulging before the tip', () => {
    const outline = buildTaperedArrowOutline(
      [
        { x: 0, y: 0 },
        { x: 320, y: 0 },
      ],
      {
        ...baseSettings,
        width: 18,
      }
    );
    const upperShoulder = outline[getTipIndex(outline) - 1];
    const lowerShoulder = outline[getTipIndex(outline) + 1];
    const shoulderSpan = Math.hypot(
      (upperShoulder?.x ?? 0) - (lowerShoulder?.x ?? 0),
      (upperShoulder?.y ?? 0) - (lowerShoulder?.y ?? 0)
    );

    expect(getMaxHeadSpan(outline)).toBe(shoulderSpan);
  });
}

function registerWidthDrivenHeadGrowthTest() {
  it('grows the head module from width instead of stretching only its length', () => {
    const thin = buildTaperedArrowOutline(
      [
        { x: 0, y: 0 },
        { x: 160, y: 0 },
      ],
      {
        ...baseSettings,
        width: 6,
      }
    );
    const thick = buildTaperedArrowOutline(
      [
        { x: 0, y: 0 },
        { x: 160, y: 0 },
      ],
      {
        ...baseSettings,
        width: 18,
      }
    );

    expect(getHeadLength(thick)).toBeGreaterThan(getHeadLength(thin));
    expect(getHeadSpan(thick)).toBeGreaterThan(getHeadSpan(thin));
  });
}

function registerLargeWidthShapeTest() {
  it('keeps the tapered head proportional when arrow width is increased on a short layer', () => {
    const outline = buildTaperedArrowOutline(
      [
        { x: 0, y: 0 },
        { x: 160, y: 0 },
      ],
      {
        ...baseSettings,
        width: 80,
      }
    );

    expect(getMaxHeadSpan(outline)).toBeLessThan(getHeadLength(outline) * 1.35);
  });
}

function registerTailThicknessTest() {
  it('keeps the tail out of the near-zero needle range', () => {
    const outline = buildTaperedArrowOutline(
      [
        { x: 0, y: 0 },
        { x: 240, y: 0 },
      ],
      {
        ...baseSettings,
        width: 18,
      }
    );
    const tailUpper = outline[0];
    const tailLower = outline.at(-1);

    expect(Math.abs((tailUpper?.y ?? 0) - (tailLower?.y ?? 0))).toBeGreaterThanOrEqual(2);
  });
}

function registerRigidCurveHeadTest() {
  it('keeps a rigid head base perpendicular to the end tangent on curve arrows', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 60, y: 40 },
      { x: 120, y: 0 },
    ];
    const outline = buildTaperedArrowOutline(points, {
      ...baseSettings,
      mode: 'curve',
      width: 12,
    });
    const centerline = buildArrowCenterline([...points], {
      ...baseSettings,
      mode: 'curve',
      width: 12,
    }).points;
    const tipFrame = getSmoothedPolylineSample(
      centerline,
      buildPolylineLengthState(centerline),
      buildPolylineLengthState(centerline).total
    );
    const baseUpper = outline[getHeadBaseUpperIndex()];
    const baseLower = outline[getHeadBaseLowerIndex(outline)];
    const baseVector = {
      x: (baseUpper?.x ?? 0) - (baseLower?.x ?? 0),
      y: (baseUpper?.y ?? 0) - (baseLower?.y ?? 0),
    };
    const baseLength = Math.hypot(baseVector.x, baseVector.y);
    const alignment =
      (baseVector.x * tipFrame.tangent.x + baseVector.y * tipFrame.tangent.y) /
      Math.max(baseLength, 1e-6);

    expect(Math.abs(alignment)).toBeLessThan(0.25);
  });
}

function registerRigidCurveHeadCountTest() {
  it('builds `curve` outlines from shaft samples plus a compact rigid head module', () => {
    const outline = buildTaperedArrowOutline(
      [
        { x: 0, y: 0 },
        { x: 60, y: 40 },
        { x: 120, y: 0 },
      ],
      {
        ...baseSettings,
        mode: 'curve',
        width: 12,
      }
    );
    const expectedLength = (TAPERED_SHAFT_SAMPLE_COUNT + 1) * 2 + TAPERED_HEAD_OUTLINE_POINT_COUNT;

    expect(outline).toHaveLength(expectedLength);
    expect(outline[getTipIndex(outline)]).toEqual({ x: 120, y: 0 });
  });
}

function registerZeroLengthFallbackTest() {
  it('keeps zero-length arrows inside the same capped-head family', () => {
    const outline = buildTaperedArrowOutline(
      [
        { x: 20, y: 20 },
        { x: 20, y: 20 },
      ],
      {
        ...baseSettings,
        width: 12,
      }
    );

    expect(outline).toHaveLength(
      (TAPERED_SHAFT_SAMPLE_COUNT + 1) * 2 + TAPERED_HEAD_OUTLINE_POINT_COUNT
    );
    expect(getHeadLength(outline)).toBeGreaterThan(0);
  });
}

describe('arrow visual tapered outline', () => {
  registerCappedHeadTest();
  registerRigidHeadShoulderTest();
  registerWidthDrivenHeadGrowthTest();
  registerLargeWidthShapeTest();
  registerTailThicknessTest();
  registerRigidCurveHeadTest();
  registerRigidCurveHeadCountTest();
  registerZeroLengthFallbackTest();
});
