// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import {
  buildVirtualNodeMappings,
  flattenOpenShadowRoots,
  resolveStreamedVirtualContent,
} from './virtual-dom.helpers';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

it('maps aligned virtual and original children recursively', () => {
  const original = document.createElement('div');
  original.innerHTML = '<section><span>One</span><span>Two</span></section>';
  const virtual = original.cloneNode(true);
  const virtualToOriginalMap = new Map<Node, Node>();
  const originalToVirtualMap = new Map<Node, Node>();

  buildVirtualNodeMappings({
    original,
    originalToVirtualMap,
    virtual,
    virtualToOriginalMap,
  });

  const originalFirstSpan = original.querySelector('span');
  const virtualFirstSpan = (virtual as HTMLElement).querySelector('span');

  expect(virtualToOriginalMap.get(virtual)).toBe(original);
  expect(originalToVirtualMap.get(original)).toBe(virtual);
  expect(virtualToOriginalMap.get(virtualFirstSpan as Node)).toBe(originalFirstSpan);
});

it('flattens open shadow roots into mapped virtual hosts and skips extension roots', () => {
  const host = document.createElement('div');
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const shadowChild = document.createElement('span');
  shadowChild.textContent = 'shadow child';
  shadowRoot.append(shadowChild);
  document.body.append(host);

  const skippedHost = document.createElement('div');
  skippedHost.id = 'sniptale-extension-root';
  const skippedShadowRoot = skippedHost.attachShadow({ mode: 'open' });
  skippedShadowRoot.append(document.createElement('span'));
  document.body.append(skippedHost);

  const virtualHost = document.createElement('div');
  const virtualToOriginalMap = new Map<Node, Node>();
  const originalToVirtualMap = new Map<Node, Node>([[host, virtualHost]]);

  flattenOpenShadowRoots({
    originalToVirtualMap,
    root: document,
    virtualToOriginalMap,
  });

  expect(virtualHost.textContent).toContain('shadow child');
  expect(virtualToOriginalMap.get(virtualHost.firstChild as Node)).toBe(shadowChild);
});

it('resolves streamed template content and ignores empty streamed placeholders', () => {
  const virtualBody = document.createElement('div');
  virtualBody.innerHTML = [
    '<template id="B:0"></template>',
    '<div id="S:0"><span>streamed</span></div>',
    '<template id="B:1"></template>',
    '<div id="S:1"></div>',
  ].join('');

  resolveStreamedVirtualContent(virtualBody);

  expect(virtualBody.textContent).toContain('streamed');
  expect(virtualBody.querySelector('#S\\:0')).toBeNull();
  expect(virtualBody.querySelector('#B\\:1')).not.toBeNull();
  expect(virtualBody.querySelector('#S\\:1')).not.toBeNull();
});
