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

it('flattens open shadow roots without trusting a page-owned extension-like id', () => {
  const host = document.createElement('div');
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const shadowChild = document.createElement('span');
  shadowChild.textContent = 'shadow child';
  shadowRoot.append(shadowChild);
  document.body.append(host);

  const lookalikeHost = document.createElement('div');
  lookalikeHost.id = 'sniptale-extension-root';
  const lookalikeShadowRoot = lookalikeHost.attachShadow({ mode: 'open' });
  const lookalikeChild = document.createElement('span');
  lookalikeChild.textContent = 'page-owned lookalike shadow';
  lookalikeShadowRoot.append(lookalikeChild);
  document.body.append(lookalikeHost);

  const virtualHost = document.createElement('div');
  const virtualLookalikeHost = document.createElement('div');
  const virtualToOriginalMap = new Map<Node, Node>();
  const originalToVirtualMap = new Map<Node, Node>([
    [host, virtualHost],
    [lookalikeHost, virtualLookalikeHost],
  ]);

  flattenOpenShadowRoots({
    originalToVirtualMap,
    root: document,
    virtualToOriginalMap,
  });

  expect(virtualHost.textContent).toContain('shadow child');
  expect(virtualToOriginalMap.get(virtualHost.firstChild as Node)).toBe(shadowChild);
  expect(virtualLookalikeHost.textContent).toContain('page-owned lookalike shadow');
  expect(virtualToOriginalMap.get(virtualLookalikeHost.firstChild as Node)).toBe(lookalikeChild);
});

it('flattens nested open shadow roots through one composed-tree discovery', () => {
  const outerHost = document.createElement('section');
  const outerRoot = outerHost.attachShadow({ mode: 'open' });
  const innerHost = document.createElement('article');
  const innerRoot = innerHost.attachShadow({ mode: 'open' });
  const nestedContent = document.createElement('strong');
  nestedContent.textContent = 'nested shadow content';
  innerRoot.append(nestedContent);
  outerRoot.append(innerHost);
  document.body.append(outerHost);
  const virtualHost = document.createElement('section');
  const virtualToOriginalMap = new Map<Node, Node>();
  const originalToVirtualMap = new Map<Node, Node>([[outerHost, virtualHost]]);

  flattenOpenShadowRoots({
    originalToVirtualMap,
    root: document,
    virtualToOriginalMap,
  });

  expect(virtualHost.textContent).toContain('nested shadow content');
  const virtualNestedContent = virtualHost.querySelector('strong');
  expect(virtualToOriginalMap.get(virtualNestedContent as Node)).toBe(nestedContent);
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
