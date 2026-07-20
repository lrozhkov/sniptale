// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { createShadowHost, createShadowRootWithStyles } from './index';

describe('shadow-dom host creation', () => {
  it('creates a host element with the canonical inline isolation contract', () => {
    const host = createShadowHost('sniptale-root');

    expect(host.id).toBe('sniptale-root');
    expect(host.tagName).toBe('DIV');
    expect(host.style.position).toBe('fixed');
    expect(host.style.pointerEvents).toBe('none');
    expect(host.style.isolation).toBe('isolate');
    expect(host.style.zIndex).toBe('2147483647');
  });
});

describe('shadow-dom shadow root creation', () => {
  it('attaches an open shadow root and injects the provided style tag', () => {
    const host = document.createElement('div');

    const shadow = createShadowRootWithStyles(host, '.sniptale-root { color: red; }');

    expect(host.shadowRoot).toBe(shadow);
    expect(shadow.mode).toBe('open');

    const styleTag = shadow.querySelector('style');
    expect(styleTag?.textContent).toBe('.sniptale-root { color: red; }');
  });
});
