// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { EFFECT_SVG_VECTOR_LIMITS } from '../../../contracts/effect-runtime/svg-vector';

import { serializeEffectSvgVector } from './vector-source';

describe('bounded SVG vector serialization', () => {
  it('serializes only path and rect payloads after structural preflight', () => {
    const vector = serializeEffectSvgVector(
      [
        '<svg viewBox="0 0 20 10"><g id="safe" fill="#fff">',
        '<circle cx="2" cy="2" r="1"/><path id="p" d="M0 0L1 1"/>',
        '<rect x="1" y="2" width="3" height="4"/></g></svg>',
      ].join('')
    );

    expect(vector).toEqual({
      height: 10,
      parts: [
        expect.objectContaining({ groupIds: ['safe'], id: 'p', type: 'path' }),
        expect.objectContaining({ groupIds: ['safe'], height: 4, type: 'rect', width: 3 }),
      ],
      width: 20,
    });
  });

  it('never invokes DOMParser for structurally rejected source', () => {
    const parser = vi.spyOn(DOMParser.prototype, 'parseFromString');

    expect(() => serializeEffectSvgVector('<svg><script/></svg>')).toThrow();
    expect(parser).not.toHaveBeenCalled();
  });

  it('rejects inherited-string amplification before producing a clone payload', () => {
    const nestedGroups = Array.from(
      { length: EFFECT_SVG_VECTOR_LIMITS.maxGroupDepth - 1 },
      (_, index) => `<g id="g${index}-${'x'.repeat(500)}">`
    ).join('');
    const rects = '<rect width="1" height="1"/>'.repeat(64);
    const closingGroups = '</g>'.repeat(EFFECT_SVG_VECTOR_LIMITS.maxGroupDepth - 1);

    expect(() =>
      serializeEffectSvgVector(
        `<svg viewBox="0 0 1 1" fill="#fff">${nestedGroups}${rects}${closingGroups}</svg>`
      )
    ).toThrow('EFFECT_SVG_BUDGET_EXCEEDED');
  });
});
