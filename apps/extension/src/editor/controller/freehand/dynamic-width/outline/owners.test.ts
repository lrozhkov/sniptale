import { expect, it } from 'vitest';

import { buildCapPoints } from './caps';
import { resolveNormal, resolveTangent } from './geometry';
import { buildRoundedJoinPoints } from './joins';
import { buildClosedOutlinePath } from './path';
import { buildOutlinePoints } from './points';

const stroke = [
  { x: 0, y: 0, width: 4 },
  { x: 10, y: 0, width: 8 },
  { x: 10, y: 10, width: 4 },
];

it('resolves dynamic stroke normals and tangents from neighboring samples', () => {
  expect(resolveNormal(stroke, 1)).toEqual({
    x: expect.closeTo(-Math.SQRT1_2),
    y: expect.closeTo(Math.SQRT1_2),
  });
  expect(resolveTangent(stroke, 1)).toEqual({
    x: expect.closeTo(Math.SQRT1_2),
    y: expect.closeTo(Math.SQRT1_2),
  });
});

it('keeps zero-length stroke vectors finite', () => {
  const repeated = [
    { x: 2, y: 3, width: 4 },
    { x: 2, y: 3, width: 4 },
  ];

  expect(resolveNormal(repeated, 0)).toEqual({
    x: expect.closeTo(0),
    y: expect.closeTo(0),
  });
  expect(resolveTangent(repeated, 0)).toEqual({
    x: expect.closeTo(0),
    y: expect.closeTo(0),
  });
});

it('builds cap and rounded-join point arcs around stroke centers', () => {
  expect(buildCapPoints(stroke[0]!, 0, Math.PI)).toHaveLength(11);
  expect(buildRoundedJoinPoints(stroke[1]!, { x: 0, y: 1 }, { x: -1, y: 0 }, 4)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ x: expect.closeTo(10), y: expect.closeTo(4) }),
      expect.objectContaining({ x: expect.closeTo(6), y: expect.closeTo(0) }),
    ])
  );
});

it('assembles outline points and serializes them as a closed Fabric path', () => {
  const outline = buildOutlinePoints(stroke);
  const path = buildClosedOutlinePath(outline);

  expect(outline.length).toBeGreaterThan(stroke.length * 2);
  expect(path?.[0]).toEqual(['M', outline[0]!.x, outline[0]!.y]);
  expect(path?.at(-1)).toEqual(['Z']);
  expect(buildClosedOutlinePath([])).toBeNull();
});
