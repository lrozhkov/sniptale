import { describe, expect, it } from 'vitest';

import { buildArrowPathData } from './paths';

function extractClosedSubpaths(path: string): string[] {
  return path
    .split('Z')
    .map((part) => part.trim())
    .filter(Boolean);
}

function getPathCoordinates(path: string): number[] {
  return path
    .trim()
    .split(' ')
    .map((token) => Number(token))
    .filter((token) => Number.isFinite(token));
}

function getPolygonXCoordinates(path: string): number[] {
  return getPathCoordinates(path).filter((_, index) => index % 2 === 0);
}

function getTopologySignature(path: string): string {
  return [
    `moves:${path.split('M').length - 1}`,
    `lines:${path.split('L').length - 1}`,
    `closed:${path.split('Z').length - 1}`,
  ].join('|');
}

function getShapeSignature(path: string): string {
  const coords = getPathCoordinates(path);
  const xs = coords.filter((_, index) => index % 2 === 0);
  const ys = coords.filter((_, index) => index % 2 === 1);

  return [
    getTopologySignature(path),
    `minX:${Math.min(...xs).toFixed(2)}`,
    `maxX:${Math.max(...xs).toFixed(2)}`,
    `minY:${Math.min(...ys).toFixed(2)}`,
    `maxY:${Math.max(...ys).toFixed(2)}`,
  ].join('|');
}

function buildArrowPath(
  endHead: 'triangle' | 'open' | 'block',
  mode: 'curve' | 'straight' = 'straight'
): string {
  return buildArrowPathData(
    mode === 'straight'
      ? [
          { x: 0, y: 0 },
          { x: 72, y: 0 },
        ]
      : [
          { x: 0, y: 0 },
          { x: 36, y: 28 },
          { x: 72, y: 0 },
        ],
    {
      color: '#f60',
      endHead,
      variant: 'standard',
      mode,
      opacity: 1,
      startHead: 'none',
      width: 6,
    } as never
  );
}

function buildTaperedArrowPath(
  overrides: Partial<{ endHead: 'triangle' | 'open'; mode: 'curve' | 'straight' }> = {}
): string {
  return buildArrowPathData(
    [
      { x: 0, y: 0 },
      { x: 72, y: 24 },
    ],
    {
      color: '#f60',
      endHead: overrides.endHead ?? 'triangle',
      mode: overrides.mode ?? 'curve',
      opacity: 1,
      startHead: 'circle',
      variant: 'tapered',
      width: 6,
    } as never
  );
}

function assertStraightArrowPathBuildsHeads() {
  it('builds straight arrow path data with heads', () => {
    expect(
      buildArrowPathData(
        [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
        ],
        {
          color: '#f60',
          endHead: 'triangle',
          mode: 'straight',
          opacity: 1,
          startHead: 'circle',
          variant: 'standard',
          width: 4,
        } as never
      )
    ).toContain('Z');
  });
}

function assertStandardShaftBuildsWithoutHeads() {
  it('builds a closed filled shaft even when standard heads are disabled', () => {
    const path = buildArrowPathData(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
      {
        color: '#f60',
        endHead: 'none',
        mode: 'straight',
        opacity: 1,
        startHead: 'none',
        variant: 'standard',
        width: 4,
      } as never
    );

    expect(path).toContain('Z');
    expect(path).not.toBe('M 0 0 L 40 0');
  });
}

function assertStandardTriangleHeadJoinStaysAttached() {
  it('keeps the standard triangle head attached without extending the shaft into the head tip', () => {
    const path = buildArrowPathData(
      [
        { x: 0, y: 0 },
        { x: 72, y: 0 },
      ],
      {
        color: '#f60',
        endHead: 'triangle',
        mode: 'straight',
        opacity: 1,
        startHead: 'none',
        variant: 'standard',
        width: 6,
      } as never
    );
    const [shaftPath = '', headPath = ''] = extractClosedSubpaths(path);
    const shaftX = getPolygonXCoordinates(shaftPath);
    const headX = getPolygonXCoordinates(headPath);

    expect(Math.max(...shaftX)).toBeLessThan(72);
    expect(Math.max(...shaftX)).toBeGreaterThan(Math.min(...headX));
  });
}

function registerStandardStraightPathTests() {
  assertStraightArrowPathBuildsHeads();
  assertStandardShaftBuildsWithoutHeads();
  assertStandardTriangleHeadJoinStaysAttached();
}

function registerHeadTopologyTests() {
  it('gives triangle, open, and block heads distinct topology signatures', () => {
    const signatures = ['triangle', 'open', 'block'].map((endHead) =>
      getShapeSignature(buildArrowPath(endHead as 'triangle' | 'open' | 'block'))
    );

    expect(new Set(signatures).size).toBe(3);
  });

  it('builds the open head as two chevron arms attached to the shaft', () => {
    const openPath = buildArrowPath('open');

    expect(extractClosedSubpaths(openPath)).toHaveLength(3);
  });
}

function registerHeadPathClosureTests() {
  it('builds closed filled SVG-like paths for all supported head variants', () => {
    const paths = ['triangle', 'open', 'block'].map((endHead) =>
      buildArrowPath(endHead as 'triangle' | 'open' | 'block')
    );

    paths.forEach((path) => {
      expect(path).toContain('Z');
      expect(path).not.toBe('M 0 0 L 40 0');
    });
  });

  it('keeps curved head-variant paths closed and distinct', () => {
    const paths = ['triangle', 'open', 'block'].map((endHead) =>
      buildArrowPath(endHead as 'triangle' | 'open' | 'block', 'curve')
    );
    const signatures = paths.map((path) => getShapeSignature(path));

    paths.forEach((path) => expect(path).toContain('Z'));
    expect(new Set(signatures).size).toBe(3);
  });

  it('treats missing runtime style metadata as a standard arrow', () => {
    const path = buildArrowPathData(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      {
        color: '#f60',
        endHead: 'triangle',
        mode: 'straight',
        opacity: 1,
        startHead: 'none',
        variant: 'standard',
        width: 0.5,
      } as never
    );

    expect(path).toContain('Z');
  });
}

function registerHeadVariantPathTests() {
  registerHeadTopologyTests();
  registerHeadPathClosureTests();
}

function registerCurvedPathTests() {
  it('builds curved arrow path data as a closed filled outline', () => {
    expect(
      buildArrowPathData(
        [
          { x: 0, y: 0 },
          { x: 20, y: 30 },
          { x: 40, y: 0 },
        ],
        {
          color: '#f60',
          endHead: 'diamond',
          mode: 'curve',
          opacity: 0.7,
          startHead: 'none',
          variant: 'standard',
          width: 5,
        } as never
      )
    ).toContain('Z');
  });

  it('ignores hidden head settings for tapered arrows but keeps straight and curve silhouettes distinct', () => {
    const triangleCurvePath = buildTaperedArrowPath();
    const openCurvePath = buildTaperedArrowPath({ endHead: 'open' });
    const openStraightPath = buildTaperedArrowPath({ endHead: 'open', mode: 'straight' });

    expect(triangleCurvePath).toContain('Z');
    expect(openCurvePath).toContain('Z');
    expect(openStraightPath).toContain('Z');
    expect(triangleCurvePath).toBe(openCurvePath);
    expect(openStraightPath).not.toBe(openCurvePath);
  });
}

function registerRoundedTaperedHeadTest() {
  it('renders tapered arrows with rounded shoulders and a rounded nose from the fixed head module', () => {
    const path = buildArrowPathData(
      [
        { x: 0, y: 0 },
        { x: 240, y: 0 },
      ],
      {
        color: '#f60',
        endHead: 'triangle',
        mode: 'straight',
        opacity: 1,
        startHead: 'none',
        variant: 'tapered',
        width: 18,
      } as never
    );

    expect(path.match(/\sQ\s/g)).toHaveLength(3);
    expect(path).toContain('Z');
  });
}

function runArrowPathSuite() {
  registerStandardStraightPathTests();
  registerHeadVariantPathTests();
  registerCurvedPathTests();
  registerRoundedTaperedHeadTest();
}

describe('object-factory arrow path seam', runArrowPathSuite);
