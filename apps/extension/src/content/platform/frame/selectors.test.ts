// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  getAccessibleIframes: vi.fn<() => HTMLIFrameElement[]>(),
  getContainingIframe: vi.fn<(element: HTMLElement) => HTMLIFrameElement | null>(),
  getIframeDocument: vi.fn<(iframe: HTMLIFrameElement) => Document | null>(),
  isIframeAccessible: vi.fn<(iframe: HTMLIFrameElement) => boolean>(),
}));

vi.mock('./core', () => coreMocks);

import {
  createCompositeSelector,
  findElementByCompositeSelector,
  findElementBySelector,
  getElementSelector,
  getIframeSelector,
  parseCompositeSelector,
  serializeCompositeSelector,
} from './selectors';

beforeEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
  coreMocks.getAccessibleIframes.mockReturnValue([]);
  coreMocks.getContainingIframe.mockReturnValue(null);
  coreMocks.getIframeDocument.mockReturnValue(null);
  coreMocks.isIframeAccessible.mockReturnValue(true);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('iframe selector generation', () => {
  it('builds iframe selectors from id, src, custom attributes, and fallback position', () => {
    const byId = document.createElement('iframe');
    byId.id = 'editor:frame';
    document.body.append(byId);
    expect(getIframeSelector(byId)).toBe('iframe#editor\\:frame');

    const bySrc = document.createElement('iframe');
    bySrc.src = 'https://example.com/reports/dashboard';
    document.body.append(bySrc);
    expect(getIframeSelector(bySrc)).toBe('iframe[src*="dashboard"]');

    const byDataAttribute = document.createElement('iframe');
    byDataAttribute.setAttribute('data-application-code', 'case-view');
    document.body.append(byDataAttribute);
    expect(getIframeSelector(byDataAttribute)).toBe('iframe[data-application-code="case-view"]');

    const byIndex = document.createElement('iframe');
    document.body.append(byIndex);
    expect(getIframeSelector(byIndex)).toBe('iframe:nth-of-type(4)');
  });
});

describe('element selector generation', () => {
  it('builds element selectors from smart ids, unique classes, and path fallback', () => {
    const sniptaleElement = document.createElement('div');
    sniptaleElement.dataset['sniptaleId'] = 'smart-1';
    expect(getElementSelector(sniptaleElement)).toBe('[data-sniptale-id="smart-1"]');

    const byId = document.createElement('button');
    byId.id = 'save:button';
    expect(getElementSelector(byId)).toBe('#save\\:button');

    const uniqueClass = document.createElement('button');
    uniqueClass.className = 'primary action sniptale-hidden shadow-row';
    document.body.append(uniqueClass);
    expect(getElementSelector(uniqueClass)).toBe('button.primary.action');

    const section = document.createElement('section');
    const row = document.createElement('div');
    const text = document.createElement('span');
    text.className = 'bad:selector';
    row.append(text);
    section.append(row);
    document.body.append(section);

    expect(getElementSelector(text)).toBe('section > div > span');
  });
});

describe('composite selector serialization', () => {
  it('creates, parses, and serializes composite selectors', () => {
    const iframe = document.createElement('iframe');
    iframe.id = 'content-frame';
    document.body.append(iframe);

    const element = document.createElement('button');
    element.id = 'primary-action';
    coreMocks.getContainingIframe.mockReturnValue(iframe);

    expect(createCompositeSelector(element)).toEqual({
      iframeSelector: 'iframe#content-frame',
      elementSelector: '#primary-action',
    });
    expect(parseCompositeSelector('iframe#content-frame => #primary-action')).toEqual({
      iframeSelector: 'iframe#content-frame',
      elementSelector: '#primary-action',
    });
    expect(
      serializeCompositeSelector({
        iframeSelector: 'iframe#content-frame',
        elementSelector: '#primary-action',
      })
    ).toBe('iframe#content-frame => #primary-action');
  });
});

describe('iframe selector composite lookup', () => {
  it('finds composite selectors and warns on missing or inaccessible iframes', () => {
    expect(
      findElementByCompositeSelector({
        iframeSelector: 'iframe#missing',
        elementSelector: '.target',
      })
    ).toBeNull();

    const blockedIframe = document.createElement('iframe');
    blockedIframe.id = 'blocked';
    document.body.append(blockedIframe);
    coreMocks.isIframeAccessible.mockReturnValueOnce(false);

    expect(
      findElementByCompositeSelector({
        iframeSelector: 'iframe#blocked',
        elementSelector: '.target',
      })
    ).toBeNull();

    const accessibleIframe = document.createElement('iframe');
    accessibleIframe.id = 'ok';
    const iframeDocument = document.implementation.createHTMLDocument('iframe');
    const target = iframeDocument.createElement('button');
    target.className = 'target';
    iframeDocument.body.append(target);
    Object.defineProperty(accessibleIframe, 'contentDocument', {
      configurable: true,
      value: iframeDocument,
    });
    document.body.append(accessibleIframe);

    expect(
      findElementByCompositeSelector({
        iframeSelector: 'iframe#ok',
        elementSelector: '.target',
      })
    ).toBe(target);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });
});

describe('iframe selector nested lookup', () => {
  it('finds selectors in the top document and nested iframe documents', () => {
    const topLevel = document.createElement('div');
    topLevel.className = 'top-level-target';
    document.body.append(topLevel);

    expect(findElementBySelector('.top-level-target')).toBe(topLevel);

    const outerIframe = document.createElement('iframe');
    const nestedIframe = document.createElement('iframe');
    const outerDocument = document.implementation.createHTMLDocument('outer');
    const nestedDocument = document.implementation.createHTMLDocument('nested');
    const nestedTarget = nestedDocument.createElement('button');
    nestedTarget.className = 'nested-target';
    nestedDocument.body.append(nestedTarget);
    outerDocument.body.append(nestedIframe);

    coreMocks.getAccessibleIframes.mockImplementation((rootDoc: Document = document) =>
      rootDoc === document ? [outerIframe] : [nestedIframe]
    );
    coreMocks.getIframeDocument.mockImplementation((iframe) => {
      if (iframe === outerIframe) return outerDocument;
      if (iframe === nestedIframe) return nestedDocument;
      return null;
    });
    coreMocks.isIframeAccessible.mockReturnValue(true);

    expect(findElementBySelector('.nested-target')).toBe(nestedTarget);
  });
});
