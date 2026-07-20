import { describe, expect, it } from 'vitest';

import {
  inspectEffectSvgBeforeDom,
  SvgPreflightError,
  SVG_LIMITS,
  type SvgPreflightErrorCode,
} from './preflight';

const VALID_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <g id="ring" fill="none" stroke="#7cf7ff" stroke-width="16">
    <circle id="outer" cx="120" cy="120" r="92" />
  </g>
  <g id="core" fill="#ff8618">
    <path id="diamond" d="M120 54 186 120 120 186 54 120Z" />
    <rect id="box" x="1" y="2" width="3" height="4" rx="1" />
  </g>
</svg>`;

describe('SVG pre-DOM structural boundary', () => {
  it('accepts the locked runtime path/rect profile and inert SDK circle nodes', () => {
    expect(inspectEffectSvgBeforeDom(VALID_SVG)).toEqual({
      nodes: 6,
      sourceCharacters: VALID_SVG.length,
    });
  });

  it.each([
    ['doctype', '<!DOCTYPE svg><svg/>', 'declaration'],
    ['entity', '<svg><path d="M0 0 &x;"/></svg>', 'entity'],
    ['script', '<svg><script/></svg>', 'element'],
    ['foreign object', '<svg><foreignObject/></svg>', 'element'],
    ['event handler', '<svg><path onload="x" d="M0 0"/></svg>', 'attribute'],
    ['external URL', '<svg><path fill="url(https://example.test/a)" d="M0 0"/></svg>', 'url'],
    ['style', '<svg><path style="fill:red" d="M0 0"/></svg>', 'attribute'],
    ['text', '<svg>author text</svg>', 'text'],
    ['mismatched close', '<svg><g></svg></g>', 'syntax'],
  ])('rejects %s before DOM parsing', (_name, source, code) => {
    expectSvgFailure(source, code as SvgPreflightErrorCode);
  });

  it('bounds depth and source size before DOM parsing', () => {
    const deep = `<svg>${'<g>'.repeat(SVG_LIMITS.maxDepth)}</g>${'</g>'.repeat(
      SVG_LIMITS.maxDepth
    )}</svg>`;
    expectSvgFailure(deep, 'depth');
    expectSvgFailure(' '.repeat(SVG_LIMITS.maxSourceCharacters + 1), 'size');
  });

  it('keeps inherited strings bounded independently from path data', () => {
    expectSvgFailure(
      `<svg fill="${'x'.repeat(SVG_LIMITS.maxPaintOrIdCharacters + 1)}"><path d="M0 0"/></svg>`,
      'attribute'
    );
    expect(inspectEffectSvgBeforeDom(`<svg><path d="${'M'.repeat(600)}"/></svg>`)).toMatchObject({
      nodes: 2,
    });
  });
});

function expectSvgFailure(source: string, code: SvgPreflightErrorCode): void {
  try {
    inspectEffectSvgBeforeDom(source);
  } catch (error) {
    expect(error).toBeInstanceOf(SvgPreflightError);
    expect((error as SvgPreflightError).code).toBe(code);
    return;
  }
  throw new Error(`Expected SVG preflight failure: ${code}`);
}
