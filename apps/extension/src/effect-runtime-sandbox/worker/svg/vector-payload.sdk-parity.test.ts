import { describe, expect, it } from 'vitest';

import { EFFECT_SVG_VECTOR_LIMITS } from '../../../contracts/effect-runtime/svg-vector';

import { parseSerializedSvgVector } from './vector-payload.js';

const pathPart = {
  cx: 5,
  cy: 5,
  fill: '#fff',
  groupId: 'logo',
  groupIds: ['logo'],
  id: 'path-a',
  opacity: 1,
  pathData: 'M0 0 L10 10',
  stroke: null,
  strokeLineCap: 'butt',
  strokeLineJoin: 'miter',
  strokeWidth: 1,
  type: 'path',
};

describe('serialized SVG vector boundary', () => {
  it('returns a locally owned vector payload', () => {
    const source = { height: 50, parts: [pathPart], width: 100 };
    const parsed = parseSerializedSvgVector(source);

    expect(parsed).toEqual(source);
    expect(parsed).not.toBe(source);
    expect(parsed?.parts).not.toBe(source.parts);
    expect(parsed?.parts[0]!.groupIds).not.toBe(pathPart.groupIds);
  });

  it('rejects malformed and oversized path payloads', () => {
    expect(
      parseSerializedSvgVector({
        height: 50,
        parts: [{ ...pathPart, opacity: Number.NaN }],
        width: 100,
      })
    ).toBeNull();
    expect(
      parseSerializedSvgVector({
        height: 50,
        parts: [{ ...pathPart, pathData: 'x'.repeat(1_500_001) }],
        width: 100,
      })
    ).toBeNull();
  });

  it('rejects aggregate inherited-string amplification at the worker boundary', () => {
    const amplified = Array.from({ length: EFFECT_SVG_VECTOR_LIMITS.maxParts }, (_, index) => ({
      ...pathPart,
      groupId: 'x'.repeat(EFFECT_SVG_VECTOR_LIMITS.maxCommonStringCharacters),
      groupIds: Array.from({ length: EFFECT_SVG_VECTOR_LIMITS.maxGroupDepth }, () =>
        'x'.repeat(EFFECT_SVG_VECTOR_LIMITS.maxCommonStringCharacters)
      ),
      id: `part-${index}`,
      pathData: 'M0 0',
    }));

    expect(parseSerializedSvgVector({ height: 1, parts: amplified, width: 1 })).toBeNull();
  });
});
