// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyDomMutationBatch,
  captureDomElementState,
  captureDomStateMap,
  createDomMutationBatch,
} from './dom';
import { clearHistoryDomLocators } from './dom-locators';
import type { PageDomElementState } from './types';

afterEach(() => {
  clearHistoryDomLocators();
  document.body.replaceChildren();
});

function readAttributeValue(state: PageDomElementState, name: string): string | undefined {
  return state.attributes[name];
}

function readAttributeRecord(state: PageDomElementState): Record<string, string> {
  return state.attributes;
}

function verifyDropsUnsafeCapturedUrlSchemes() {
  const link = document.createElement('a');
  link.setAttribute('href', 'javascript:alert(1)');
  link.setAttribute('title', 'safe');

  const image = document.createElement('img');
  image.setAttribute('src', 'data:text/html;base64,abc');
  image.setAttribute('alt', 'preview');

  const vbscriptLink = document.createElement('a');
  vbscriptLink.setAttribute('href', 'vbscript:msgbox("x")');

  expect(readAttributeRecord(captureDomElementState(link))).toEqual({ title: 'safe' });
  expect(readAttributeRecord(captureDomElementState(image))).toEqual({ alt: 'preview' });
  expect(readAttributeRecord(captureDomElementState(vbscriptLink))).toEqual({});
}

function verifyPreservesSafeUrlSchemes() {
  const link = document.createElement('a');
  link.setAttribute('href', '/docs/help');
  link.setAttribute('target', '_blank');

  const image = document.createElement('img');
  image.setAttribute('src', 'https://example.com/image.png');

  const mailLink = document.createElement('a');
  mailLink.setAttribute('href', 'mailto:test@example.com');

  expect(readAttributeRecord(captureDomElementState(link))).toEqual({
    href: '/docs/help',
    rel: 'noopener noreferrer',
    target: '_blank',
  });
  expect(readAttributeRecord(captureDomElementState(image))).toEqual({
    src: 'https://example.com/image.png',
  });
  expect(readAttributeRecord(captureDomElementState(mailLink))).toEqual({
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

  const afterState = batch.patches[0]?.after;
  expect(afterState && readAttributeValue(afterState, 'href')).toBeUndefined();

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

function verifyRejectsVariableStyleIndirection() {
  const link = document.createElement('a');
  link.id = 'history-variable-style-target';
  link.textContent = 'Open';
  document.body.append(link);

  const batch = createDomMutationBatch([link]);
  const nextAttributes = batch.patches[0]?.after.attributes;
  if (!nextAttributes) {
    throw new Error('Expected mutation patch attributes');
  }
  nextAttributes['style'] = [
    'background-image: var(--remote-image);',
    'list-style-image: v\\61r(--remote-list-image);',
    'font-family: "safe\\\"", var(--remote-font);',
    'background-image: v\\61\r\nr(--remote-crlf-image);',
  ].join(' ');

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
  it('rejects direct and escaped CSS variable indirection during replay', () =>
    verifyRejectsVariableStyleIndirection());
});
