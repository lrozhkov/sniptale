// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';

import { normalizeGenericVirtualDom } from './normalize-virtual-dom';

function resetNormalizeVirtualDom(): void {
  document.body.replaceChildren();
}

function createGenericProfile() {
  return {
    vendor: 'generic' as const,
    appFamily: 'generic-web',
    pageKind: 'content',
    pipelineId: 'generic-structured',
    confidence: 0.8,
    matchedSignals: [],
    preferredRoots: ['article'],
  };
}

function createPortalProfile() {
  return {
    vendor: 'naumen-portal' as const,
    appFamily: 'naumen-service-desk',
    pageKind: 'homepage',
    pipelineId: 'naumen-portal',
    confidence: 0.9,
    matchedSignals: [],
    preferredRoots: ['.Main__root'],
  };
}

afterEach(() => {
  resetNormalizeVirtualDom();
});

it('annotates heading, list, quote, callout, and code-like nodes for generic pages', () => {
  const root = document.createElement('div');

  const heading = document.createElement('h2');
  const list = document.createElement('ul');
  const quote = document.createElement('blockquote');
  const callout = document.createElement('div');
  callout.className = 'callout';
  const code = document.createElement('pre');

  root.append(heading, list, quote, callout, code);

  const normalized = normalizeGenericVirtualDom(root, createGenericProfile());

  expect(normalized).toBe(root);
  expect(heading.dataset['scNormalizedKind']).toBe('heading');
  expect(list.dataset['scNormalizedKind']).toBe('list');
  expect(quote.dataset['scNormalizedKind']).toBe('quote');
  expect(callout.dataset['scNormalizedKind']).toBe('callout');
  expect(code.dataset['scNormalizedKind']).toBe('code');
});

it('leaves non-generic virtual roots untouched', () => {
  const root = document.createElement('div');
  const heading = document.createElement('h2');
  const code = document.createElement('pre');
  root.append(heading, code);

  const normalized = normalizeGenericVirtualDom(root, createPortalProfile());

  expect(normalized).toBe(root);
  expect(heading.dataset['scNormalizedKind']).toBeUndefined();
  expect(code.dataset['scNormalizedKind']).toBeUndefined();
});
