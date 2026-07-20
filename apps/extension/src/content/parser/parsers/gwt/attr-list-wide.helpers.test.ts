// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { TraversalContext } from '../types';
import {
  buildWideAttributeFallbackValue,
  buildWideAttributeField,
  extractFroalaContentSync,
  extractVirtualIframeContent,
  resolveWideAttributeFrame,
} from './attr-list-wide.helpers';

function createTraversalContext(): TraversalContext {
  return {
    currentSection: null,
    globalFieldIndex: 0,
    globalTableIndex: 0,
    processedAttrLists: new Set<HTMLTableElement>(),
    processedCommentContainers: new Set<HTMLElement>(),
    processedComments: new Set<HTMLElement>(),
    processedFieldElements: new Set<HTMLElement>(),
    processedTables: new Set<HTMLTableElement>(),
    result: {
      context: '',
      structure: [],
      title: '',
    },
    sectionElements: [],
    sectionIndex: 0,
  };
}

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

function registerDynamicVirtualContentTest() {
  it('serializes virtual dynamic fields content through the dynamic-fields extractor', () => {
    const container = appendElement(document.body, 'div');
    container.setAttribute('data-application-code', 'dynamicFields');
    const field = appendElement(container, 'div', {
      className: 'FormField-EA__field FormField-EA__fieldRead',
    });
    const info = appendElement(field, 'div', {
      className: 'FormField-EA__fieldInfo',
    });
    appendElement(info, 'span', {
      textContent: 'Статус',
    });
    appendElement(field, 'div', {
      className: 'FormField-EA__fieldBody',
      textContent: 'В работе',
    });

    expect(extractVirtualIframeContent(container)).toBe('Статус: В работе');
  });
}

function registerRichTextVirtualContentTest() {
  it('extracts rich-text virtual iframe content and removes hidden elements', () => {
    const container = appendElement(document.body, 'div');
    const body = appendElement(container, 'div', {
      className: 'fr-view',
      textContent: 'Описание ',
    });
    appendElement(body, 'span', {
      className: 'hidden',
      textContent: 'скрыто',
    });
    appendElement(body, 'span', {
      textContent: 'задачи',
    });

    expect(extractVirtualIframeContent(container)).toBe('Описание задачи');
  });
}

function registerHiddenRichTextIframeTest() {
  it('removes hidden nodes from rich-text iframe extraction results', () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'about:blank';
    const iframeDocument = document.implementation.createHTMLDocument('rich-text');
    const view = appendElement(iframeDocument.body, 'div', {
      className: 'fr-view',
      textContent: 'Видимый ',
    });
    appendElement(view, 'span', {
      className: 'hidden',
      textContent: 'скрытый',
    });
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: iframeDocument,
    });

    expect(extractFroalaContentSync(iframe)).toEqual({
      images: [],
      text: 'Видимый',
    });
  });
}

function registerVirtualFroalaRemovalTest() {
  it('uses the shared froala extractor for virtual iframe containers with hidden content', () => {
    const container = appendElement(document.body, 'div');
    container.setAttribute('data-virtual-iframe', 'true');
    const view = appendElement(container, 'div', {
      className: 'fr-view',
      textContent: 'Текст ',
    });
    appendElement(view, 'span', {
      className: 'hidden',
      textContent: 'скрытый',
    });

    expect(extractFroalaContentSync(container)).toEqual({
      images: [],
      text: 'Текст',
    });
  });
}

function registerFroalaIframeExtractionTest() {
  it('extracts same-origin iframe text and attachment metadata', () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'about:blank';
    const iframeDocument = document.implementation.createHTMLDocument('rich-text');
    const view = appendElement(iframeDocument.body, 'div', {
      className: 'fr-view',
      textContent: 'Документ ',
    });
    const image = appendElement(view, 'img');
    image.src = 'https://example.test/file?uuid=file$photo123';
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: iframeDocument,
    });

    const result = extractFroalaContentSync(iframe);

    expect(result).toEqual({
      images: [
        expect.objectContaining({
          src: expect.stringContaining('uuid=file$photo123'),
          uuid: 'photo123',
        }),
      ],
      text: expect.stringContaining('Документ [file_photo123]'),
    });
  });
}

function registerFrameResolutionTest() {
  it('prefers real iframes and falls back to virtual containers', () => {
    const realWrapper = appendElement(document.body, 'div');
    const realIframe = appendElement(realWrapper, 'iframe', {
      id: 'real-frame',
    });
    const virtualWrapper = appendElement(document.body, 'div');
    const virtualIframe = appendElement(virtualWrapper, 'div', {
      id: 'iframe$virtual-frame',
    });
    virtualIframe.setAttribute('data-virtual-iframe', 'true');

    expect(resolveWideAttributeFrame(realWrapper)).toEqual({
      iframeContainer: realIframe,
      isVirtualIframe: false,
    });
    expect(resolveWideAttributeFrame(virtualWrapper)).toEqual({
      iframeContainer: virtualIframe,
      isVirtualIframe: true,
    });
  });

  it('resolves virtual iframe wrappers from embedded iframe-source markers', () => {
    const virtualWrapper = appendElement(document.body, 'div');
    const iframeSource = appendElement(virtualWrapper, 'span');
    iframeSource.setAttribute('data-iframe-source', 'rich-text');

    expect(resolveWideAttributeFrame(virtualWrapper)).toEqual({
      iframeContainer: virtualWrapper,
      isVirtualIframe: true,
    });
  });
}

function registerFallbackValueAndFieldTest() {
  it('builds fallback labels for embedded apps, froala frames, and generic iframes', () => {
    const embeddedApp = appendElement(document.body, 'div');
    embeddedApp.setAttribute('data-application-code', 'comments');
    const froalaIframe = appendElement(document.body, 'iframe', {
      id: 'iframe$editor',
    });
    froalaIframe.src = 'https://example.test/richText?uuid=fallback-42';
    const genericIframe = appendElement(document.body, 'iframe', {
      id: 'frame-generic',
    });
    genericIframe.src = 'https://example.test/embedded/page?id=7';
    const valueEl = appendElement(document.body, 'div', {
      id: 'gwt-debug-wide-value',
    });

    expect(buildWideAttributeFallbackValue(embeddedApp, true)).toBe('[Embedded App: comments]');
    expect(buildWideAttributeFallbackValue(froalaIframe, true)).toBe(
      '[Froala Editor - uuid: fallback-42]'
    );
    expect(buildWideAttributeFallbackValue(genericIframe, false)).toBe(
      '[Содержимое в iframe: frame-generic]'
    );

    const ctx = createTraversalContext();
    const field = buildWideAttributeField(ctx, valueEl, 'Описание', 'Готово');
    expect(field).toEqual(
      expect.objectContaining({
        id: 'field-gwt-debug-wide-value',
        label: 'Описание',
        value: 'Готово',
      })
    );
    expect(valueEl.getAttribute('data-sniptale-id')).toBe('field-gwt-debug-wide-value');
    expect(ctx.globalFieldIndex).toBe(1);
  });
}

describe('gwt attr list wide helpers', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  registerDynamicVirtualContentTest();
  registerRichTextVirtualContentTest();
  registerHiddenRichTextIframeTest();
  registerVirtualFroalaRemovalTest();
  registerFroalaIframeExtractionTest();
  registerFrameResolutionTest();
  registerFallbackValueAndFieldTest();
});
