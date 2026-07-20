import { describe, expect, it } from 'vitest';

import { buildTaperedArrowPathData } from './tapered';

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

function parsePathPoints(path: string): Array<{ x: number; y: number }> {
  const tokens = path.split(' ');
  const points: Array<{ x: number; y: number }> = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] !== 'M' && tokens[index] !== 'L') {
      continue;
    }

    points.push({
      x: Number(tokens[index + 1] ?? 0),
      y: Number(tokens[index + 2] ?? 0),
    });
    index += 2;
  }

  return points;
}

function parseQuadraticControlPoints(path: string): Array<{ x: number; y: number }> {
  const tokens = path.split(' ');
  const points: Array<{ x: number; y: number }> = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] !== 'Q') {
      continue;
    }

    points.push({
      x: Number(tokens[index + 1] ?? 0),
      y: Number(tokens[index + 2] ?? 0),
    });
    index += 4;
  }

  return points;
}

function countQuadraticCommands(path: string): number {
  return path.match(/\bQ\b/g)?.length ?? 0;
}

function registerClosedSilhouetteTest() {
  it('builds one closed shaft-plus-head silhouette with rounded head commands only', () => {
    const path = buildTaperedArrowPathData(
      [
        { x: 0, y: 0 },
        { x: 96, y: 0 },
      ],
      baseSettings
    );

    expect(path).toContain('Z');
    expect(countQuadraticCommands(path)).toBe(3);
  });
}

function registerStraightHeadCapTest() {
  it('keeps straight heads compact while letting the shaft absorb extra length', () => {
    const mediumPoints = parsePathPoints(
      buildTaperedArrowPathData(
        [
          { x: 0, y: 0 },
          { x: 120, y: 0 },
        ],
        {
          ...baseSettings,
          width: 18,
        }
      )
    );
    const longPoints = parsePathPoints(
      buildTaperedArrowPathData(
        [
          { x: 0, y: 0 },
          { x: 320, y: 0 },
        ],
        {
          ...baseSettings,
          width: 18,
        }
      )
    );

    expect(Math.max(...longPoints.map((point) => point.x))).toBeGreaterThan(
      Math.max(...mediumPoints.map((point) => point.x))
    );
    expect(Math.max(...longPoints.map((point) => point.y))).toBeCloseTo(
      Math.max(...mediumPoints.map((point) => point.y)),
      5
    );
  });
}

function registerCurveShapeTest() {
  it('keeps curve arrows in one closed silhouette while preserving a distinct rigid head', () => {
    const path = buildTaperedArrowPathData(
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
    const controlPoints = parseQuadraticControlPoints(path);

    expect(path).toContain('Z');
    expect(controlPoints).toContainEqual({ x: 120, y: 0 });
  });
}

function registerWidthScalingTest() {
  it('scales both the head and shaft thickness when width increases', () => {
    const thinPoints = parsePathPoints(
      buildTaperedArrowPathData(
        [
          { x: 0, y: 0 },
          { x: 120, y: 0 },
        ],
        {
          ...baseSettings,
          width: 6,
        }
      )
    );
    const thickPoints = parsePathPoints(
      buildTaperedArrowPathData(
        [
          { x: 0, y: 0 },
          { x: 120, y: 0 },
        ],
        {
          ...baseSettings,
          width: 18,
        }
      )
    );

    expect(
      Math.max(...thickPoints.map((point) => point.y)) -
        Math.min(...thickPoints.map((point) => point.y))
    ).toBeGreaterThan(
      Math.max(...thinPoints.map((point) => point.y)) -
        Math.min(...thinPoints.map((point) => point.y))
    );
  });
}

describe('arrow visual tapered path', () => {
  registerClosedSilhouetteTest();
  registerStraightHeadCapTest();
  registerCurveShapeTest();
  registerWidthScalingTest();
});
