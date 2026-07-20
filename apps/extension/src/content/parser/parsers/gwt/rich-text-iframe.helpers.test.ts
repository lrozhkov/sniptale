// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  extractFroalaIframeContent,
  extractRichTextIframeContent,
} from './rich-text-iframe.helpers';

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

function appendImage(parent: ParentNode, uuid: string): void {
  const image = appendElement(parent, 'img');
  image.src = `https://example.test/file?uuid=file$${uuid}`;
}

function createIframeWithDocument(bodyBuilder: (body: HTMLElement) => void): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.src = 'about:blank';
  const iframeDocument = document.implementation.createHTMLDocument('rich-text');
  bodyBuilder(iframeDocument.body);
  Object.defineProperty(iframe, 'contentDocument', {
    configurable: true,
    value: iframeDocument,
  });
  return iframe;
}

describe('rich-text iframe helpers', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('extracts same-origin iframe content through the shared froala helper', () => {
    const iframe = createIframeWithDocument((body) => {
      const view = appendElement(body, 'div', {
        className: 'fr-view',
        textContent: 'Описание ',
      });
      appendImage(view, 'photo123');
    });

    expect(extractFroalaIframeContent(iframe)).toEqual({
      images: [
        expect.objectContaining({
          src: expect.stringContaining('uuid=file$photo123'),
          uuid: 'photo123',
        }),
      ],
      text: expect.stringContaining('Описание [file_photo123]'),
    });
  });

  it('supports hidden-node filtering when the shared extractor requests it', () => {
    const view = appendElement(document.body, 'div', {
      className: 'fr-view',
      textContent: 'Видимый ',
    });
    appendElement(view, 'span', {
      className: 'hidden',
      textContent: 'скрытый',
    });

    expect(extractRichTextIframeContent(view, { removeHidden: true })).toEqual({
      images: [],
      text: 'Видимый',
    });
  });
});
