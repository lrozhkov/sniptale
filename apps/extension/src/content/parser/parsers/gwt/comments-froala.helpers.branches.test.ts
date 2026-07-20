// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { extractFroalaContentSync } from './comments-froala.helpers';

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

function registerContentWindowFallbackTest() {
  it('reads same-origin iframe content from contentWindow when contentDocument is absent', () => {
    const iframeDocument = document.implementation.createHTMLDocument('froala');
    appendElement(iframeDocument.body, 'div', {
      className: 'fr-view',
      textContent: 'Контент из contentWindow',
    });
    const iframe = {
      src: '',
      contentDocument: null,
      contentWindow: { document: iframeDocument },
      tagName: 'IFRAME',
    } as unknown as HTMLIFrameElement;

    expect(extractFroalaContentSync(iframe)).toEqual({
      images: [],
      text: 'Контент из contentWindow',
    });
  });
}

function registerOuterCatchGuardTest() {
  it('returns null when iframe access throws before body extraction', () => {
    const iframe = {
      tagName: 'IFRAME',
      get src() {
        throw new Error('broken src');
      },
    } as unknown as HTMLIFrameElement;

    expect(extractFroalaContentSync(iframe)).toBeNull();
  });
}

describe('gwt comments froala helpers branches', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  registerContentWindowFallbackTest();
  registerOuterCatchGuardTest();
});
