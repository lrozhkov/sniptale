// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyDomMutationBatch,
  captureDomElementState,
  captureDomStateMap,
  createDomMutationBatch,
} from './dom';
import { clearHistoryDomLocators } from './dom-locators';

afterEach(() => {
  clearHistoryDomLocators();
  document.body.replaceChildren();
});

describe('page-preparation-history SVG style replay', () => {
  it('captures and restores safe inline styles on SVG elements', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.id = 'history-svg-target';
    circle.style.setProperty('color', 'red');
    svg.append(circle);
    document.body.append(svg);
    const beforeStates = captureDomStateMap([circle]);

    circle.style.setProperty('color', 'blue');
    const batch = createDomMutationBatch([circle], beforeStates);

    expect(applyDomMutationBatch(batch, 'undo').success).toBe(true);
    expect(circle.style.color).toBe('red');
    expect(applyDomMutationBatch(batch, 'redo').success).toBe(true);
    expect(circle.style.color).toBe('blue');
  });

  it('does not capture or replay non-style SVG attributes and child markup', () => {
    const xmlNamespace = 'http://www.w3.org/XML/1998/namespace';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    group.id = 'history-svg-style-only';
    group.style.setProperty('color', 'red');
    group.setAttributeNS(xmlNamespace, 'xml:base', 'https://tracker.example/external.svg');
    group.setAttribute('ping', 'https://tracker.example/audit');
    group.setAttribute('shape-inside', 'url(https://tracker.example/shape.svg#target)');
    group.setAttribute('STYLE', 'color: purple');
    group.setAttributeNS('urn:page-lookalike', 'evil:style', 'color: orange');
    use.setAttribute('href', '#symbol');
    group.append(use);
    svg.append(group);
    document.body.append(svg);
    const beforeStates = captureDomStateMap([group]);

    expect(captureDomElementState(group).attributes).toEqual({ style: 'color: red;' });

    group.style.setProperty('color', 'blue');
    group.removeAttributeNS(xmlNamespace, 'base');
    group.removeAttribute('ping');
    group.removeAttribute('shape-inside');
    group.removeAttribute('STYLE');
    group.removeAttributeNS('urn:page-lookalike', 'style');
    use.remove();
    const batch = createDomMutationBatch([group], beforeStates);

    expect(applyDomMutationBatch(batch, 'undo').success).toBe(true);
    expect(group.style.color).toBe('red');
    expect(group.getAttributeNS(xmlNamespace, 'base')).toBeNull();
    expect(group.getAttribute('ping')).toBeNull();
    expect(group.getAttribute('shape-inside')).toBeNull();
    expect(group.getAttribute('STYLE')).toBeNull();
    expect(group.getAttributeNS('urn:page-lookalike', 'style')).toBeNull();
    expect(group.children).toHaveLength(0);
  });

  it('rejects CSS variable indirection without mutating unrelated SVG attributes', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.id = 'history-svg-variable-style';
    circle.setAttribute('fill', 'url(https://tracker.example/original.svg#paint)');
    svg.append(circle);
    document.body.append(svg);

    const batch = createDomMutationBatch([circle]);
    const nextAttributes = batch.patches[0]?.after.attributes;
    if (!nextAttributes) {
      throw new Error('Expected SVG replay attributes');
    }
    nextAttributes['style'] = [
      'background-image: v\\61r(--remote-paint);',
      'font-family: "safe\\\"", var(--remote-font);',
      'background-image: v\\61\r\nr(--remote-crlf-paint);',
    ].join(' ');

    expect(applyDomMutationBatch(batch, 'redo').success).toBe(true);
    expect(circle.getAttribute('style')).toBeNull();
    expect(circle.getAttribute('fill')).toBe('url(https://tracker.example/original.svg#paint)');
  });

  it('allocates a collision-free locator instead of replaying onto a duplicate SVG identity', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const first = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const second = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    first.setAttribute('data-sniptale-id', 'page-duplicate');
    second.setAttribute('data-sniptale-id', 'page-duplicate');
    first.style.setProperty('color', 'green');
    second.style.setProperty('color', 'red');
    svg.append(first, second);
    document.body.append(svg);
    const beforeStates = captureDomStateMap([second]);

    second.style.setProperty('color', 'blue');
    const batch = createDomMutationBatch([second], beforeStates);

    expect(second.getAttribute('data-sniptale-id')).not.toBe('page-duplicate');
    expect(applyDomMutationBatch(batch, 'undo').success).toBe(true);
    expect(first.style.color).toBe('green');
    expect(second.style.color).toBe('red');
  });

  it('round-trips a uniquely escaped page-provided SVG locator', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('data-sniptale-id', 'probe"] ~ circle[data-secret="value');
    circle.style.setProperty('color', 'red');
    svg.append(circle);
    document.body.append(svg);
    const beforeStates = captureDomStateMap([circle]);

    circle.style.setProperty('color', 'blue');
    const batch = createDomMutationBatch([circle], beforeStates);

    expect(applyDomMutationBatch(batch, 'undo').success).toBe(true);
    expect(circle.style.color).toBe('red');
  });

  it('fails closed when a duplicate locator appears after capture', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.style.setProperty('color', 'red');
    svg.append(circle);
    document.body.append(svg);
    const beforeStates = captureDomStateMap([circle]);

    circle.style.setProperty('color', 'blue');
    const batch = createDomMutationBatch([circle], beforeStates);
    const locatorId = circle.getAttribute('data-sniptale-id');
    if (!locatorId) {
      throw new Error('Expected owned history locator');
    }
    const decoySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const decoy = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    decoy.setAttribute('data-sniptale-id', locatorId);
    decoy.style.setProperty('color', 'green');
    decoySvg.append(decoy);
    document.body.prepend(decoySvg);

    expect(applyDomMutationBatch(batch, 'undo')).toEqual({
      missingLocators: [batch.patches[0]?.locator],
      success: false,
    });
    expect(circle.style.color).toBe('blue');
    expect(decoy.style.color).toBe('green');
  });

  it('fails closed when the owned locator moves from the source to a decoy', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const decoy = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.style.setProperty('color', 'red');
    decoy.style.setProperty('color', 'green');
    svg.append(circle, decoy);
    document.body.append(svg);
    const beforeStates = captureDomStateMap([circle]);

    circle.style.setProperty('color', 'blue');
    const batch = createDomMutationBatch([circle], beforeStates);
    const locatorId = circle.getAttribute('data-sniptale-id');
    if (!locatorId) {
      throw new Error('Expected owned history locator');
    }
    circle.removeAttribute('data-sniptale-id');
    decoy.setAttribute('data-sniptale-id', locatorId);

    expect(applyDomMutationBatch(batch, 'undo').success).toBe(false);
    expect(circle.style.color).toBe('blue');
    expect(decoy.style.color).toBe('green');
  });

  it('restores only the source page identity during locator cleanup', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const decoy = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('data-sniptale-id', 'page-owned-id');
    svg.append(circle, decoy);
    document.body.append(svg);

    captureDomStateMap([circle]);
    const ownedLocatorId = circle.getAttribute('data-sniptale-id');
    if (!ownedLocatorId) {
      throw new Error('Expected owned history locator');
    }
    expect(ownedLocatorId).not.toBe('page-owned-id');
    decoy.setAttribute('data-sniptale-id', ownedLocatorId);

    clearHistoryDomLocators();

    expect(circle.getAttribute('data-sniptale-id')).toBe('page-owned-id');
    expect(decoy.getAttribute('data-sniptale-id')).toBe(ownedLocatorId);
  });

  it('keeps same-origin iframe replay bound to the captured inner element', () => {
    const iframe = document.createElement('iframe');
    iframe.id = 'history-same-origin-frame';
    document.body.append(iframe);
    const iframeDocument = iframe.contentDocument;
    if (!iframeDocument) {
      throw new Error('Expected same-origin iframe document');
    }
    const svg = iframeDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const circle = iframeDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.style.setProperty('color', 'red');
    svg.append(circle);
    iframeDocument.body.append(svg);
    const beforeStates = captureDomStateMap([circle]);

    circle.style.setProperty('color', 'blue');
    const batch = createDomMutationBatch([circle], beforeStates);
    const locatorId = circle.getAttribute('data-sniptale-id');
    if (!locatorId) {
      throw new Error('Expected iframe history locator');
    }
    const decoy = iframeDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
    decoy.setAttribute('data-sniptale-id', locatorId);
    svg.prepend(decoy);

    expect(applyDomMutationBatch(batch, 'undo').success).toBe(false);
    expect(circle.style.color).toBe('blue');
  });
});
