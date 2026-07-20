// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { collectIframeElements, shouldIgnoreIframeMutation } from './discovery';

describe('iframe discovery helpers', () => {
  it('collects direct and nested iframes from a root node', () => {
    const root = document.createElement('div');
    const directIframe = document.createElement('iframe');
    const nestedWrapper = document.createElement('div');
    const nestedIframe = document.createElement('iframe');
    nestedWrapper.append(nestedIframe);
    root.append(directIframe, nestedWrapper);

    expect(collectIframeElements(root)).toEqual([directIframe, nestedIframe]);
    expect(collectIframeElements(directIframe)).toEqual([directIframe]);
  });

  it('ignores mutations inside extension-owned overlays only', () => {
    const ownedWrapper = document.createElement('div');
    ownedWrapper.className = 'sniptale-highlight-container';
    const regularWrapper = document.createElement('div');

    expect(shouldIgnoreIframeMutation(ownedWrapper)).toBe(true);
    expect(shouldIgnoreIframeMutation(regularWrapper)).toBe(false);
  });
});
