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

    const byHostileDataAttribute = document.createElement('iframe');
    byHostileDataAttribute.setAttribute('data-application-code', 'case => view"\\\n');
    document.body.append(byHostileDataAttribute);
    const hostileSelector = getIframeSelector(byHostileDataAttribute);
    expect(hostileSelector).not.toContain('case => view');
    expect(document.querySelectorAll(hostileSelector)).toHaveLength(1);
    expect(document.querySelector(hostileSelector)).toBe(byHostileDataAttribute);

    const byIndex = document.createElement('iframe');
    document.body.append(byIndex);
    expect(getIframeSelector(byIndex)).toBe('iframe:nth-of-type(5)');
  });

  it('escapes CSS-special custom-element ancestors in structural iframe selectors', () => {
    const firstHost = document.createElement('x-frame.host');
    const secondHost = document.createElement('x-frame.host');
    const first = document.createElement('iframe');
    const second = document.createElement('iframe');
    firstHost.append(first);
    secondHost.append(second);
    document.body.append(firstHost, secondHost);

    const selector = getIframeSelector(second);

    expect(selector).toContain('x-frame\\.host');
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    expect(document.querySelector(selector)).toBe(second);
  });
});

describe('element selector generation', () => {
  it('builds element selectors from smart ids, unique classes, and path fallback', () => {
    const sniptaleElement = document.createElement('div');
    sniptaleElement.dataset['sniptaleId'] = 'smart-1';
    document.body.append(sniptaleElement);
    expect(getElementSelector(sniptaleElement)).toBe('[data-sniptale-id="smart-1"]');

    const byId = document.createElement('button');
    byId.id = 'save:button';
    document.body.append(byId);
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

    expect(getElementSelector(text)).toBe('span.bad\\:selector');
  });
});

describe('composite selector serialization', () => {
  it('creates, parses, and serializes composite selectors', () => {
    const iframe = document.createElement('iframe');
    iframe.id = 'content-frame';
    document.body.append(iframe);

    const element = document.createElement('button');
    element.id = 'primary-action';
    document.body.append(element);
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

  it('round-trips composite selectors when iframe metadata contains the grammar delimiter', () => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('data-application-code', 'case => view"\\\n');
    document.body.append(iframe);
    const element = document.createElement('button');
    element.id = 'primary-action';
    document.body.append(element);
    coreMocks.getContainingIframe.mockReturnValue(iframe);

    const composite = createCompositeSelector(element);
    const serialized = serializeCompositeSelector(composite);

    expect(serialized.split(' => ')).toHaveLength(2);
    expect(parseCompositeSelector(serialized)).toEqual(composite);
  });
});
