import { expect, it } from 'vitest';
import type { EditorArrowSettings } from '../../../features/editor/document/types';
import { distanceSquared, distanceToSegmentSquared } from './geometry/distance';
import { normalizeArrowPoints } from './geometry/normalization';
import { buildArrowPointsFromOptions } from './geometry/options';
import { clonePoint, isPointLike } from './geometry/points';
import { parseArrowPointsJson, serializeArrowPoints } from './geometry/serialization';

function createArrowSettings(mode: EditorArrowSettings['mode']): EditorArrowSettings {
  return {
    color: '#ff671d',
    endHead: 'triangle',
    mode,
    opacity: 1,
    shadow: 0,
    startHead: 'none',
    variant: 'standard',
    width: 4,
  };
}

function runPointSerializationSuite() {
  it('clones, validates, serializes, and parses point payloads', () => {
    const point = { x: 3, y: 4 };

    expect(clonePoint(point)).toEqual({ x: 3, y: 4 });
    expect(isPointLike(point)).toBe(true);
    expect(isPointLike({ x: 3 })).toBe(false);
    expect(serializeArrowPoints([point])).toBe('[{"x":3,"y":4}]');
    expect(parseArrowPointsJson('[{"x":0,"y":0},{"x":10,"y":5}]')).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
    ]);
    expect(parseArrowPointsJson('')).toBeNull();
    expect(parseArrowPointsJson('[{"x":0}]')).toBeNull();
    expect(parseArrowPointsJson('not json')).toBeNull();
  });
}

function runBuildArrowPointsSuite() {
  it('builds arrow points from explicit points, sanitized fallbacks, control points, or defaults', () => {
    expect(
      buildArrowPointsFromOptions({
        control: null,
        end: { x: 20, y: 10 },
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
        start: { x: 0, y: 0 },
      })
    ).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    expect(
      buildArrowPointsFromOptions({
        control: { x: 5, y: 6 },
        end: { x: 20, y: 10 },
        start: { x: 0, y: 0 },
      })
    ).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 6 },
      { x: 20, y: 10 },
    ]);
    expect(buildArrowPointsFromOptions({})).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(
      buildArrowPointsFromOptions({
        end: { x: 20, y: 10 },
        points: [{ x: 1, y: 2 }, { x: 'bad' } as never],
        start: { x: 0, y: 0 },
      })
    ).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 10 },
    ]);
  });
}

it('normalizes default point arrays', () => {
  expect(normalizeArrowPoints([], createArrowSettings('straight'))).toEqual([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ]);
  expect(normalizeArrowPoints([{ x: 2, y: 3 }], createArrowSettings('straight'))).toEqual([
    { x: 2, y: 3 },
    { x: 2, y: 3 },
  ]);
});

it('normalizes mode-specific point arrays', () => {
  const curved = normalizeArrowPoints(
    [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ],
    createArrowSettings('curve')
  );
  const elbowHorizontal = normalizeArrowPoints(
    [
      { x: 0, y: 0 },
      { x: 30, y: 10 },
    ],
    { ...createArrowSettings('straight'), arrowType: 'elbow' }
  );
  const elbowVertical = normalizeArrowPoints(
    [
      { x: 0, y: 0 },
      { x: 10, y: 30 },
    ],
    { ...createArrowSettings('straight'), arrowType: 'elbow' }
  );
  const curvedType = normalizeArrowPoints(
    [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ],
    { ...createArrowSettings('straight'), arrowType: 'curved' }
  );

  expect(curved).toHaveLength(3);
  expect(elbowHorizontal).toEqual([
    { x: 0, y: 0 },
    { x: 15, y: 0 },
    { x: 15, y: 10 },
    { x: 30, y: 10 },
  ]);
  expect(elbowVertical).toEqual([
    { x: 0, y: 0 },
    { x: 0, y: 15 },
    { x: 10, y: 15 },
    { x: 10, y: 30 },
  ]);
  expect(curvedType).toHaveLength(3);
});

it('computes point and segment distances', () => {
  expect(distanceSquared({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
  expect(distanceToSegmentSquared({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(25);
  expect(distanceToSegmentSquared({ x: 5, y: 5 }, { x: 2, y: 2 }, { x: 2, y: 2 })).toBe(18);
});

it('normalizes explicit elbow routes into orthogonal routes and removes redundant points', () => {
  const elbow = normalizeArrowPoints(
    [
      { x: 0, y: 0 },
      { x: 30, y: 20 },
      { x: 60, y: 20 },
    ],
    { ...createArrowSettings('curve'), arrowType: 'elbow' }
  );

  expect(elbow).toEqual([
    { x: 0, y: 0 },
    { x: 15, y: 0 },
    { x: 15, y: 20 },
    { x: 60, y: 20 },
  ]);
});

runPointSerializationSuite();
runBuildArrowPointsSuite();
