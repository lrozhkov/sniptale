// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { applyIsolatedContentRootStyle } from './isolated';

describe('applyIsolatedContentRootStyle', () => {
  it('resets host-page visual bleed before applying root-specific layout styles', () => {
    const element = document.createElement('div');

    applyIsolatedContentRootStyle(
      element,
      `
        position: fixed;
        top: 0;
        left: 0;
        z-index: 2147483647;
      `
    );

    expect(element.style.all).toBe('initial');
    expect(element.style.display).toBe('block');
    expect(element.style.background).toBe('transparent');
    expect(element.style.opacity).toBe('1');
    expect(element.style.position).toBe('fixed');
    expect(element.style.top).toBe('0px');
    expect(element.style.left).toBe('0px');
    expect(element.style.zIndex).toBe('2147483647');
  });
});
