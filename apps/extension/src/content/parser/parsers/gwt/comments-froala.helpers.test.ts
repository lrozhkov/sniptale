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

function appendRichTextImage(parent: ParentNode, uuid: string) {
  const image = appendElement(parent, 'img');
  image.src = `https://example.test/file?uuid=file$${uuid}`;
  return image;
}

function createIframeWithDocument(src: string, bodyBuilder: (body: HTMLElement) => void) {
  const iframe = document.createElement('iframe');
  iframe.src = src;
  const iframeDocument = document.implementation.createHTMLDocument('froala');
  bodyBuilder(iframeDocument.body);
  Object.defineProperty(iframe, 'contentDocument', {
    configurable: true,
    value: iframeDocument,
  });
  return iframe;
}

function registerVirtualIframeExtractionTest() {
  it('extracts text and attachments from a virtual iframe container', () => {
    const container = appendElement(document.body, 'div');
    container.setAttribute('data-virtual-iframe', 'true');
    const editable = appendElement(container, 'div', {
      className: 'fr-view',
      textContent: 'Комментарий ',
    });
    appendElement(editable, 'a', {
      href: 'https://example.test/comment',
      textContent: 'со ссылкой',
    });
    appendRichTextImage(editable, 'abc123');

    const result = extractFroalaContentSync(container);

    expect(result).toEqual({
      images: [
        expect.objectContaining({
          src: expect.stringContaining('uuid=file$abc123'),
          uuid: 'abc123',
        }),
      ],
      text: expect.stringContaining('Комментарий со ссылкой [file_abc123]'),
    });
  });
}

function registerIframeDocumentExtractionTest() {
  it('extracts same-origin iframe body content and strips editor chrome', () => {
    const iframe = createIframeWithDocument('about:blank', (body) => {
      appendElement(body, 'div', {
        className: 'fr-toolbar',
        textContent: 'toolbar',
      });
      const editable = appendElement(body, 'div', {
        className: 'fr-view',
        textContent: 'Вложенный ',
      });
      appendElement(editable, 'a', {
        href: 'https://example.test/item',
        textContent: 'текст',
      });
      appendRichTextImage(editable, 'xyz789');
    });

    const result = extractFroalaContentSync(iframe);

    expect(result).toEqual({
      images: [
        expect.objectContaining({
          src: expect.stringContaining('uuid=file$xyz789'),
          uuid: 'xyz789',
        }),
      ],
      text: expect.stringContaining('Вложенный текст [file_xyz789]'),
    });
  });
}

function registerCrossOriginGuardTest() {
  it('returns null for cross-origin iframes outside allowed rich-text schemes', () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'https://external.example/editor';

    expect(extractFroalaContentSync(iframe)).toBeNull();
  });
}

function registerVirtualContainerHeuristicTest() {
  it('recognizes virtual iframe containers by generated iframe id', () => {
    const container = appendElement(document.body, 'div', {
      id: 'iframe$editor-1',
      textContent: 'Текст без специальных вложений',
    });

    const result = extractFroalaContentSync(container);

    expect(result).toEqual({
      images: [],
      text: 'Текст без специальных вложений',
    });
  });
}

function registerVirtualContainerSourceMarkerTest() {
  it('recognizes virtual containers by embedded iframe-source markers', () => {
    const container = appendElement(document.body, 'div');
    appendElement(container, 'div').setAttribute('data-iframe-source', 'rich-text');
    appendElement(container, 'div', {
      className: 'fr-view',
      textContent: 'Контент из источника iframe',
    });

    expect(extractFroalaContentSync(container)).toEqual({
      images: [],
      text: 'Контент из источника iframe',
    });
  });
}

function registerFallbackImageNameAndSourceHeuristicTests() {
  it('uses fallback image labels for non-matching uuids and recognizes data-iframe-source containers', () => {
    const container = appendElement(document.body, 'div');
    const source = appendElement(container, 'div');
    source.setAttribute('data-iframe-source', 'rich-text');
    const editable = appendElement(container, 'div', {
      className: 'fr-view',
      textContent: 'Контент ',
    });
    const image = appendElement(editable, 'img');
    image.src = 'https://example.test/file?uuid=file$-broken';

    const result = extractFroalaContentSync(container);

    expect(result).toEqual({
      images: [],
      text: expect.stringContaining('Контент [file_image_1]'),
    });
  });
}

function registerHiddenContentPreservationTest() {
  it('preserves hidden text nodes for comments rich-text extraction', () => {
    const container = appendElement(document.body, 'div');
    container.setAttribute('data-virtual-iframe', 'true');
    const editable = appendElement(container, 'div', {
      className: 'fr-view',
      textContent: 'Комментарий ',
    });
    appendElement(editable, 'span', {
      className: 'hidden',
      textContent: 'скрытый',
    });

    expect(extractFroalaContentSync(container)).toEqual({
      images: [],
      text: 'Комментарий скрытый',
    });
  });
}

function registerIframeBodyGuardTest() {
  it('returns null when the iframe document body is unavailable', () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'about:blank';
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: { body: null },
    });

    expect(extractFroalaContentSync(iframe)).toBeNull();
  });
}

describe('gwt comments froala helpers', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  registerVirtualIframeExtractionTest();
  registerIframeDocumentExtractionTest();
  registerCrossOriginGuardTest();
  registerVirtualContainerHeuristicTest();
  registerVirtualContainerSourceMarkerTest();
  registerFallbackImageNameAndSourceHeuristicTests();
  registerHiddenContentPreservationTest();
  registerIframeBodyGuardTest();
});
