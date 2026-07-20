// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { TraversalContext } from '../types';
import {
  extractDynamicFieldsContent,
  extractVirtualDynamicFieldsContent,
  extractVirtualDynamicFieldsText,
} from './attr-list-dynamic-fields.helpers';

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
    result: { context: '', structure: [], title: '' },
    sectionElements: [],
    sectionIndex: 0,
  };
}

function appendField(root: ParentNode, id: string) {
  const field = document.createElement('div');
  field.id = id;
  field.className = 'FormField-EA__field FormField-EA__fieldRead';
  root.append(field);
  return field;
}

function appendFieldInfo(field: HTMLElement, label?: string, asText = false) {
  const info = document.createElement('div');
  info.className = 'FormField-EA__fieldInfo';
  if (asText) {
    info.textContent = label ?? '';
  } else if (label) {
    const span = document.createElement('span');
    span.textContent = label;
    info.append(span);
  }
  field.append(info);
}

function appendFieldBody(field: HTMLElement) {
  const body = document.createElement('div');
  body.className = 'FormField-EA__fieldBody';
  field.append(body);
  return body;
}

function appendPreferredValue(body: HTMLElement, className: string, value: string) {
  const preferred = document.createElement('div');
  preferred.className = className;
  preferred.textContent = value;
  body.append(preferred);
  return preferred;
}

function createDynamicIframeDocument() {
  return document.implementation.createHTMLDocument('dynamic-fields');
}

function registerPreferredFallbackAndOriginalFallbackTests() {
  it('uses text-only labels, keeps preferred value nodes, and mirrors ids to original field containers', () => {
    const originalRoot = document.createElement('div');
    document.body.append(originalRoot);
    const originalField = appendField(originalRoot, 'row-state');
    appendFieldInfo(originalField, 'ignored');

    const virtualContainer = document.createElement('div');
    const virtualField = appendField(virtualContainer, 'row-state');
    appendFieldInfo(virtualField, 'Статус', true);
    const valueNode = appendPreferredValue(appendFieldBody(virtualField), 'stringView', 'Закрыто');

    const fields = extractVirtualDynamicFieldsContent(virtualContainer, createTraversalContext());

    expect(fields).toEqual([
      expect.objectContaining({
        label: 'Статус',
        value: 'Закрыто',
        sourceElement: valueNode,
      }),
    ]);
    expect(originalField.getAttribute('data-sniptale-id')).toBe('field-row-state');
  });
}

function registerMalformedFieldFallbackTests() {
  it('returns null for fields without labels or bodies and skips text serialization for empty rows', () => {
    const virtualContainer = document.createElement('div');
    const withoutInfo = appendField(virtualContainer, 'row-no-info');
    appendFieldBody(withoutInfo).textContent = 'Без подписи';
    const withoutBody = appendField(virtualContainer, 'row-no-body');
    appendFieldInfo(withoutBody, 'Поле без тела');

    expect(
      extractVirtualDynamicFieldsContent(virtualContainer, createTraversalContext())
    ).toBeNull();
    expect(extractVirtualDynamicFieldsText(virtualContainer)).toBeNull();
  });
}

function registerIframeContentWindowFallbackTests() {
  it('reads dynamic fields from contentWindow fallback and rejects iframe documents without body', () => {
    const iframeDocument = createDynamicIframeDocument();
    const field = appendField(iframeDocument.body, 'row-window');
    appendFieldInfo(field, 'Источник');
    appendFieldBody(field).textContent = 'contentWindow';

    const iframe = document.createElement('iframe');
    iframe.setAttribute('data-application-code', 'dynamicFields');
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: { document: iframeDocument },
    });

    const bodylessIframe = document.createElement('iframe');
    bodylessIframe.setAttribute('data-application-code', 'dynamicFields');
    Object.defineProperty(bodylessIframe, 'contentWindow', {
      configurable: true,
      value: { document: { body: null } },
    });

    expect(extractDynamicFieldsContent(iframe, createTraversalContext())).toEqual([
      expect.objectContaining({
        label: 'Источник',
        value: 'contentWindow',
      }),
    ]);
    expect(extractDynamicFieldsContent(bodylessIframe, createTraversalContext())).toBeNull();
  });
}

describe('gwt dynamic fields helpers branches', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  registerPreferredFallbackAndOriginalFallbackTests();
  registerMalformedFieldFallbackTests();
  registerIframeContentWindowFallbackTests();
});
