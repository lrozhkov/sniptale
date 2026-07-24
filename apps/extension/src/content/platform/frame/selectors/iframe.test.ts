// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { getIframeSelector } from './iframe';

it('uses the supplied owner document when deriving a positional iframe selector', () => {
  const ownerDocument = document.implementation.createHTMLDocument('iframe-owner');
  const first = ownerDocument.createElement('iframe');
  const second = ownerDocument.createElement('iframe');
  ownerDocument.body.append(first, second);

  expect(getIframeSelector(second, ownerDocument)).toBe('iframe:nth-of-type(2)');
});

it('scopes anonymous iframe positions through separate parent containers', () => {
  const ownerDocument = document.implementation.createHTMLDocument('iframe-owner');
  const firstContainer = ownerDocument.createElement('section');
  const secondContainer = ownerDocument.createElement('section');
  const first = ownerDocument.createElement('iframe');
  const second = ownerDocument.createElement('iframe');
  firstContainer.append(first);
  secondContainer.append(second);
  ownerDocument.body.append(firstContainer, secondContainer);

  const selector = getIframeSelector(second, ownerDocument);

  expect(ownerDocument.querySelector(selector)).toBe(second);
  expect(selector).toContain('section:nth-of-type(2) > iframe:nth-of-type(1)');
});

it('falls back to a scoped path when an attribute selector is not unique', () => {
  const ownerDocument = document.implementation.createHTMLDocument('iframe-owner');
  const firstContainer = ownerDocument.createElement('section');
  const secondContainer = ownerDocument.createElement('section');
  const first = ownerDocument.createElement('iframe');
  const second = ownerDocument.createElement('iframe');
  first.src = 'https://example.com/shared';
  second.src = 'https://example.com/shared';
  firstContainer.append(first);
  secondContainer.append(second);
  ownerDocument.body.append(firstContainer, secondContainer);

  const selector = getIframeSelector(second, ownerDocument);

  expect(selector).not.toBe('iframe[src*="shared"]');
  expect(ownerDocument.querySelector(selector)).toBe(second);
});
