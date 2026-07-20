import { describe, expect, it } from 'vitest';
import { buildClosedCandidatePath } from './closed-path';

function createClosedPathPoints() {
  return [
    { x: 0, y: 0 },
    { x: 42, y: 0 },
    { x: 42, y: 30 },
    { x: 0, y: 30 },
    { x: 0, y: 0 },
  ];
}

function registerRoundedCandidateBuildTest() {
  it('builds rounded closed paths from recognition candidates', () => {
    const points = createClosedPathPoints();
    expect(
      buildClosedCandidatePath(
        {
          center: { x: 21, y: 15 },
          confidence: 1,
          height: 30,
          kind: 'circle',
          width: 30,
        },
        points
      ).length
    ).toBeGreaterThan(4);
  });
}

function registerEllipseAndTriangleBuildTest() {
  it('builds ellipse and triangle closed paths from recognition candidates', () => {
    const points = createClosedPathPoints();

    expect(
      buildClosedCandidatePath(
        {
          center: { x: 21, y: 15 },
          confidence: 1,
          height: 24,
          kind: 'ellipse',
          rotation: Math.PI / 8,
          width: 38,
        },
        points
      ).length
    ).toBeGreaterThan(4);
    expect(
      buildClosedCandidatePath(
        {
          confidence: 1,
          kind: 'triangle',
          vertices: [
            { x: 10, y: 40 },
            { x: 48, y: 4 },
            { x: 80, y: 42 },
          ],
        },
        points
      )
    ).toHaveLength(4);
  });
}

function registerQuadCandidateBuildTest() {
  it('builds rectangle and diamond closed paths from recognition candidates', () => {
    const points = createClosedPathPoints();

    expect(
      buildClosedCandidatePath(
        {
          confidence: 1,
          height: 30,
          kind: 'rectangle',
          width: 42,
        },
        points
      )
    ).toHaveLength(5);
    expect(
      buildClosedCandidatePath(
        {
          confidence: 1,
          height: 30,
          kind: 'diamond',
          width: 42,
        },
        points
      )
    ).toHaveLength(5);
  });
}

function registerUnsupportedCandidateTest() {
  it('returns an empty path for non-closed candidate kinds', () => {
    const points = createClosedPathPoints();

    expect(
      buildClosedCandidatePath(
        {
          confidence: 1,
          kind: 'line',
          shaft: {
            end: { x: 42, y: 0 },
            start: { x: 0, y: 0 },
          },
        },
        points
      )
    ).toEqual([]);
    expect(
      buildClosedCandidatePath(
        {
          confidence: 1,
          kind: 'arrow',
          shaft: {
            end: { x: 42, y: 0 },
            start: { x: 0, y: 0 },
          },
        },
        points
      )
    ).toEqual([]);
  });
}

function registerOrientationFlipTest() {
  it('reverses the fitted closed path when the raw stroke direction is opposite', () => {
    const path = buildClosedCandidatePath(
      {
        confidence: 1,
        kind: 'triangle',
        vertices: [
          { x: 10, y: 40 },
          { x: 48, y: 4 },
          { x: 80, y: 42 },
        ],
      },
      [
        { x: 10, y: 40 },
        { x: 80, y: 42 },
        { x: 48, y: 4 },
        { x: 10, y: 40 },
      ]
    );

    expect(path[1]!.x).toBeGreaterThan(path[0]!.x);
  });
}

describe('editor-controller freehand closed-path seam', () => {
  registerRoundedCandidateBuildTest();
  registerEllipseAndTriangleBuildTest();
  registerQuadCandidateBuildTest();
  registerUnsupportedCandidateTest();
  registerOrientationFlipTest();
});
