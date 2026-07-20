// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { validateSvgSafety } from './svg-safety';

function parseSvg(text: string): Element {
  const document = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = document.documentElement;
  if (!root || root.localName !== 'svg') {
    throw new Error('Expected SVG root');
  }
  return root;
}

describe('validateSvgSafety', () => {
  it('rejects scriptable URL schemes in attribute values', () => {
    expect(
      validateSvgSafety(parseSvg('<svg><path data-target="vbscript:msgbox(1)" /></svg>'))
    ).toEqual([expect.objectContaining({ code: 'unsafe-svg', detail: 'data-target' })]);
  });
});
