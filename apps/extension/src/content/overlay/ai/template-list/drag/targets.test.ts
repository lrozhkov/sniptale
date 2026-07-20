// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { findTemplateIdUnderPoint } from './targets';

function createPillElement(rect: { bottom: number; left: number; right: number; top: number }) {
  const element = document.createElement('div');
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      height: rect.bottom - rect.top,
      width: rect.right - rect.left,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
  return element;
}

describe('findTemplateIdUnderPoint', () => {
  it('returns the template id whose pill bounds contain the pointer', () => {
    const pillRefs = new Map([
      ['template-1', createPillElement({ bottom: 30, left: 10, right: 50, top: 10 })],
      ['template-2', createPillElement({ bottom: 80, left: 60, right: 100, top: 40 })],
    ]);

    expect(findTemplateIdUnderPoint(pillRefs, 20, 20)).toBe('template-1');
    expect(findTemplateIdUnderPoint(pillRefs, 80, 60)).toBe('template-2');
  });

  it('returns null when the pointer is outside all pill bounds', () => {
    const pillRefs = new Map([
      ['template-1', createPillElement({ bottom: 30, left: 10, right: 50, top: 10 })],
    ]);

    expect(findTemplateIdUnderPoint(pillRefs, 200, 200)).toBeNull();
  });
});
