// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  buildWideAttributeFallbackValue,
  extractFroalaContentSync,
  extractVirtualIframeContent,
  resolveWideAttributeFrame,
} from './attr-list-wide.helpers';

function appendElement<K extends keyof HTMLElementTagNameMap>(
  parent: ParentNode,
  tagName: K,
  props?: Partial<HTMLElementTagNameMap[K]>
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (props) {
    Object.assign(element, props);
  }
  parent.append(element);
  return element;
}

function registerVirtualCatchGuardTest() {
  it('returns null when virtual iframe content extraction throws', () => {
    const container = appendElement(document.body, 'div');
    Object.defineProperty(container, 'querySelector', {
      configurable: true,
      value: () => {
        throw new Error('broken body lookup');
      },
    });

    expect(extractVirtualIframeContent(container)).toBeNull();
  });
}

function registerFroalaContentWindowFallbackTests() {
  it('reads same-origin rich text from contentWindow and uses canonical file placeholders', () => {
    const iframeDocument = document.implementation.createHTMLDocument('rich-text');
    const view = appendElement(iframeDocument.body, 'div', {
      className: 'fr-view',
      textContent: 'Контент ',
    });
    const image = appendElement(view, 'img');
    image.src = 'https://example.test/file?uuid=file$-broken';
    const iframe = document.createElement('iframe');
    iframe.src = 'about:blank';
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: null,
    });
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: { document: iframeDocument },
    });

    expect(extractFroalaContentSync(iframe)).toEqual({
      images: [],
      text: expect.stringContaining('Контент [file_image_1]'),
    });
  });

  it('returns null when same-origin iframe document has no body', () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'about:blank';
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: { document: { body: null } },
    });

    expect(extractFroalaContentSync(iframe)).toBeNull();
  });
}

function registerVirtualFrameResolutionTest() {
  it('returns an empty resolution when no real or virtual iframe is present', () => {
    expect(resolveWideAttributeFrame(document.createElement('div'))).toEqual({
      iframeContainer: null,
      isVirtualIframe: false,
    });
  });
}

function registerFallbackPlaceholderVariantsTest() {
  it('uses unknown embedded-app labels and generic iframe src fallbacks', () => {
    const embeddedApp = document.createElement('div');
    embeddedApp.setAttribute('data-application-code', '');
    const genericIframe = document.createElement('iframe');
    genericIframe.src =
      'https://example.test/embedded/really/long/path/that/should/be/truncated/at/fifty';

    expect(buildWideAttributeFallbackValue(embeddedApp, false)).toBe('[Embedded App: unknown]');
    expect(buildWideAttributeFallbackValue(genericIframe, false)).toBe(
      '[Содержимое в iframe: https://example.test/embedded/really/long/path/tha]'
    );
  });
}

describe('gwt attr list wide helpers branches', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  registerVirtualCatchGuardTest();
  registerFroalaContentWindowFallbackTests();
  registerVirtualFrameResolutionTest();
  registerFallbackPlaceholderVariantsTest();
});
