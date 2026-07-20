// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyDomMutationBatch,
  captureDomElementState,
  captureDomStateMap,
  createDomMutationBatch,
} from './dom';

afterEach(() => {
  document.body.replaceChildren();
});

function verifyDropsUnsafeCapturedUrlSchemes() {
  const link = document.createElement('a');
  link.setAttribute('href', 'javascript:alert(1)');
  link.setAttribute('title', 'safe');

  const image = document.createElement('img');
  image.setAttribute('src', 'data:text/html;base64,abc');
  image.setAttribute('alt', 'preview');

  const vbscriptLink = document.createElement('a');
  vbscriptLink.setAttribute('href', 'vbscript:msgbox("x")');

  expect(captureDomElementState(link).attributes).toEqual({ title: 'safe' });
  expect(captureDomElementState(image).attributes).toEqual({ alt: 'preview' });
  expect(captureDomElementState(vbscriptLink).attributes).toEqual({});
}

function verifyPreservesSafeUrlSchemes() {
  const link = document.createElement('a');
  link.setAttribute('href', '/docs/help');
  link.setAttribute('target', '_blank');

  const image = document.createElement('img');
  image.setAttribute('src', 'https://example.com/image.png');

  const mailLink = document.createElement('a');
  mailLink.setAttribute('href', 'mailto:test@example.com');

  expect(captureDomElementState(link).attributes).toEqual({
    href: '/docs/help',
    rel: 'noopener noreferrer',
    target: '_blank',
  });
  expect(captureDomElementState(image).attributes).toEqual({
    src: 'https://example.com/image.png',
  });
  expect(captureDomElementState(mailLink).attributes).toEqual({
    href: 'mailto:test@example.com',
  });
}

function verifyDoesNotRestoreUnsafeUrls() {
  const link = document.createElement('a');
  link.id = 'history-url-filter-target';
  link.setAttribute('href', '/safe');
  link.textContent = 'link';
  document.body.append(link);

  const beforeStates = captureDomStateMap([link]);

  link.setAttribute('href', 'javascript:alert(1)');
  const batch = createDomMutationBatch([link], beforeStates);

  expect(batch.patches[0]?.after.attributes['href']).toBeUndefined();

  link.setAttribute('href', '/safe');
  const result = applyDomMutationBatch(batch, 'redo');

  expect(result).toEqual({ missingLocators: [], success: true });
  expect(link.getAttribute('href')).toBeNull();
}

function verifyRemovesExistingInlineEventHandlers() {
  const button = document.createElement('button');
  button.id = 'history-existing-on-attr-target';
  button.setAttribute('onclick', 'alert(1)');
  button.textContent = 'Save';
  document.body.append(button);

  const batch = createDomMutationBatch([button]);
  const result = applyDomMutationBatch(batch, 'redo');

  expect(result).toEqual({ missingLocators: [], success: true });
  expect(button.getAttribute('onclick')).toBeNull();
}

function verifyNormalizesReplayedStyleAndTargetAttributes() {
  const link = document.createElement('a');
  link.id = 'history-attribute-normalization-target';
  link.textContent = 'Open';
  document.body.append(link);

  const batch = createDomMutationBatch([link]);
  const nextAttributes = batch.patches[0]?.after.attributes;
  if (!nextAttributes) {
    throw new Error('Expected mutation patch attributes');
  }
  Object.assign(nextAttributes, {
    href: 'https://example.com/doc',
    onclick: 'alert(1)',
    style: 'color: red; position: fixed; background-image: url("https://example.com/image.png");',
    target: '_blank',
  });

  const result = applyDomMutationBatch(batch, 'redo');

  expect(result).toEqual({ missingLocators: [], success: true });
  expect(link.getAttribute('onclick')).toBeNull();
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  expect(link.style.color).toBe('red');
  expect(link.style.position).toBe('');
  expect(link.style.backgroundImage).toBe('');
}

function verifyRejectsObfuscatedStyleFetchVectors() {
  const link = document.createElement('a');
  link.id = 'history-obfuscated-style-target';
  link.textContent = 'Open';
  document.body.append(link);

  const batch = createDomMutationBatch([link]);
  const nextAttributes = batch.patches[0]?.after.attributes;
  if (!nextAttributes) {
    throw new Error('Expected mutation patch attributes');
  }
  Object.assign(nextAttributes, {
    style: [
      'color: red;',
      'background-image: u\\72l("https://tracker.example/pixel.png");',
      '@im/* hidden */port "https://tracker.example/style.css";',
    ].join(' '),
  });

  const result = applyDomMutationBatch(batch, 'redo');

  expect(result).toEqual({ missingLocators: [], success: true });
  expect(link.getAttribute('style')).toBeNull();
}

describe('page-preparation-history dom URL capture filtering', () => {
  it(
    'drops unsafe href and src schemes from captured element state',
    verifyDropsUnsafeCapturedUrlSchemes
  );
  it('preserves safe relative and credential-free URL schemes', verifyPreservesSafeUrlSchemes);
});

describe('page-preparation-history dom replay filtering', () => {
  it('does not restore unsafe URLs during DOM history replay', verifyDoesNotRestoreUnsafeUrls);
  it(
    'removes existing inline event handlers even when sanitized history state matches',
    verifyRemovesExistingInlineEventHandlers
  );
  it(
    'normalizes replayed style and target attributes before mutating the DOM',
    verifyNormalizesReplayedStyleAndTargetAttributes
  );
  it('rejects obfuscated CSS fetch vectors during DOM history replay', () =>
    verifyRejectsObfuscatedStyleFetchVectors());
});
