import { expect, it } from 'vitest';
import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import { distanceSquared, distanceToSegmentSquared } from './distance';
import { normalizeArrowPoints } from './normalization';
import { buildArrowPointsFromOptions } from './options';
import { clonePoint, isPointLike } from './points';
import { parseArrowPointsJson, serializeArrowPoints } from './serialization';

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

it('owns arrow point guards and JSON point serialization', () => {
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
  expect(parseArrowPointsJson({ x: 0 })).toBeNull();
  expect(parseArrowPointsJson('{"x":0,"y":0}')).toBeNull();
  expect(parseArrowPointsJson('[{"x":0,"y":0},{"x":"bad","y":5}]')).toBeNull();
  expect(parseArrowPointsJson('not json')).toBeNull();
});

it('owns arrow option defaults and mode normalization', () => {
  expect(buildArrowPointsFromOptions({})).toEqual([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
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

  const curved = normalizeArrowPoints(
    [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ],
    createArrowSettings('curve')
  );
  expect(curved).toHaveLength(3);
});

it('owns arrow geometry distance math', () => {
  expect(distanceSquared({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
  expect(distanceToSegmentSquared({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(25);
  expect(distanceToSegmentSquared({ x: 5, y: 5 }, { x: 2, y: 2 }, { x: 2, y: 2 })).toBe(18);
});
