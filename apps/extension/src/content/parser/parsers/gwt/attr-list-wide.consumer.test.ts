// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { TraversalContext } from '../types';
import { parseAttributes } from './attr-list.helpers';

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

function buildVirtualWideAttrList(contentBuilder: (value: HTMLElement) => void) {
  const table = document.createElement('table');
  table.className = 'attrList';
  const tbody = document.createElement('tbody');
  const row = document.createElement('tr');
  const wideCell = document.createElement('td');
  wideCell.className = 'attrWide';
  const caption = document.createElement('div');
  caption.id = 'gwt-debug-description-caption';
  caption.textContent = 'Описание:';
  const value = document.createElement('div');
  value.id = 'gwt-debug-description-value';
  contentBuilder(value);
  wideCell.append(caption, value);
  row.append(wideCell);
  tbody.append(row);
  table.append(tbody);
  document.body.append(table);
  return table;
}

function registerVirtualWideRichTextTest() {
  it('parses virtual wide rich-text containers through the virtual iframe helper path', () => {
    const table = buildVirtualWideAttrList((value) => {
      const virtualIframe = document.createElement('div');
      virtualIframe.id = 'iframe$wide-editor';
      virtualIframe.setAttribute('data-virtual-iframe', 'true');
      const editable = document.createElement('div');
      editable.className = 'fr-view';
      editable.textContent = 'Детальное ';
      const hidden = document.createElement('span');
      hidden.className = 'hidden';
      hidden.textContent = 'скрыто';
      const visible = document.createElement('span');
      visible.textContent = 'описание';
      editable.append(hidden, visible);
      virtualIframe.append(editable);
      value.append(virtualIframe);
    });

    const fields = parseAttributes(table, createTraversalContext());

    expect(fields).toEqual([
      expect.objectContaining({
        label: 'Описание',
        value: 'Детальное описание',
      }),
    ]);
  });
}

function registerVirtualWideRichTextImageTest() {
  it('preserves file placeholders for images inside virtual wide rich-text containers', () => {
    const table = buildVirtualWideAttrList((value) => {
      const virtualIframe = document.createElement('div');
      virtualIframe.id = 'iframe$wide-editor';
      virtualIframe.setAttribute('data-virtual-iframe', 'true');
      const editable = document.createElement('div');
      editable.className = 'fr-view';
      editable.append('Детальное ');
      const image = document.createElement('img');
      image.src = 'https://example.test/file?uuid=file$photo123';
      editable.append(image, ' описание');
      virtualIframe.append(editable);
      value.append(virtualIframe);
    });

    const fields = parseAttributes(table, createTraversalContext());

    expect(fields).toEqual([
      expect.objectContaining({
        label: 'Описание',
        value: 'Детальное [file_photo123] описание',
      }),
    ]);
  });
}

function registerFallbackWideIframeTest() {
  it('falls back to embedded app, froala, and generic iframe placeholders for unresolved wide iframes', () => {
    const dynamicTable = buildVirtualWideAttrList((value) => {
      const iframe = document.createElement('iframe');
      iframe.id = 'iframe$unknown-app';
      iframe.setAttribute('data-application-code', 'history');
      value.append(iframe);
    });
    const froalaTable = buildVirtualWideAttrList((value) => {
      const iframe = document.createElement('iframe');
      iframe.id = 'iframe$rich-editor';
      iframe.src = 'https://external.example/richText?uuid=fallback-99';
      value.append(iframe);
    });
    const genericTable = buildVirtualWideAttrList((value) => {
      const iframe = document.createElement('iframe');
      iframe.src =
        'https://example.test/embedded/really/long/path/that/should/be/truncated/at/fifty';
      value.append(iframe);
    });

    const dynamicFields = parseAttributes(dynamicTable, createTraversalContext());
    const froalaFields = parseAttributes(froalaTable, createTraversalContext());
    const genericFields = parseAttributes(genericTable, createTraversalContext());

    expect(dynamicFields).toEqual([
      expect.objectContaining({
        label: 'Описание',
        value: '[Embedded App: history]',
      }),
    ]);
    expect(froalaFields).toEqual([
      expect.objectContaining({
        label: 'Описание',
        value: '[Froala Editor - uuid: fallback-99]',
      }),
    ]);
    expect(genericFields).toEqual([
      expect.objectContaining({
        label: 'Описание',
        value: '[Содержимое в iframe: https://example.test/embedded/really/long/path/tha]',
      }),
    ]);
  });
}

describe('gwt attr list wide consumer paths', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  registerVirtualWideRichTextTest();
  registerVirtualWideRichTextImageTest();
  registerFallbackWideIframeTest();
});
