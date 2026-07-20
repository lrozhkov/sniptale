// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { TraversalContext } from '../types';
import {
  buildDynamicIframeFieldNodes,
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
    result: {
      context: '',
      structure: [],
      title: '',
    },
    sectionElements: [],
    sectionIndex: 0,
  };
}

function appendFieldInfo(field: HTMLElement, labelText?: string) {
  const info = document.createElement('div');
  info.className = 'FormField-EA__fieldInfo';
  if (labelText) {
    const label = document.createElement('span');
    label.textContent = labelText;
    info.append(label);
  }
  field.append(info);
}

function appendTextOnlyFieldInfo(field: HTMLElement, labelText = '') {
  const info = document.createElement('div');
  info.className = 'FormField-EA__fieldInfo';
  info.textContent = labelText;
  field.append(info);
}

function appendFieldBody(field: HTMLElement) {
  const body = document.createElement('div');
  body.className = 'FormField-EA__fieldBody';
  field.append(body);
  return body;
}

function appendDynamicFieldInfo(
  field: HTMLElement,
  options: { label?: string; labelAsText?: boolean }
) {
  if (options.labelAsText) {
    appendTextOnlyFieldInfo(field, options.label);
    return;
  }

  appendFieldInfo(field, options.label);
}

function appendDynamicFieldValue(
  body: HTMLElement,
  options: {
    value?: string;
    linkHref?: string;
    nested?: boolean;
    preferredValueClass?: string;
  }
) {
  if (options.linkHref) {
    const link = document.createElement('a');
    link.href = options.linkHref;
    link.textContent = options.value ?? '';
    body.append(link);
    return;
  }

  if (options.nested) {
    const control = document.createElement('div');
    control.className = 'FormField-EA__control';
    const nested = document.createElement('span');
    nested.className = 'DynamicValue__text';
    nested.textContent = options.value ?? '';
    control.append(nested);
    body.append(control);
    return;
  }

  if (options.preferredValueClass && options.value) {
    const preferred = document.createElement('div');
    preferred.className = options.preferredValueClass;
    preferred.textContent = options.value;
    body.append(preferred);
    return;
  }

  if (options.value) {
    body.textContent = options.value;
  }
}

function appendDynamicField(
  root: ParentNode,
  options: {
    id: string;
    label?: string;
    labelAsText?: boolean;
    value?: string;
    linkHref?: string;
    nested?: boolean;
    preferredValueClass?: string;
    withoutBody?: boolean;
    withoutInfo?: boolean;
  }
) {
  const field = document.createElement('div');
  field.id = options.id;
  field.className = 'FormField-EA__field FormField-EA__fieldRead';
  if (!options.withoutInfo) {
    appendDynamicFieldInfo(field, options);
  }
  if (options.withoutBody) {
    root.append(field);
    return field;
  }

  const body = appendFieldBody(field);
  appendDynamicFieldValue(body, options);
  root.append(field);
  return field;
}

function createIframeDocument() {
  const iframeDocument = document.implementation.createHTMLDocument('dynamic-fields');
  return iframeDocument;
}

afterEach(() => {
  document.body.replaceChildren();
});

function registerVirtualMirroringTest() {
  it('extracts virtual fields, filters invalid rows, and mirrors ids to the original target', () => {
    const originalRoot = document.createElement('div');
    document.body.append(originalRoot);
    const originalField = appendDynamicField(originalRoot, {
      id: 'row-ticket',
      label: 'Тикет',
      value: 'Ticket 42',
      linkHref: 'https://example.test/tickets/42',
    });

    const virtualContainer = document.createElement('div');
    const virtualField = originalField.cloneNode(true) as HTMLElement;
    virtualContainer.append(virtualField);
    appendDynamicField(virtualContainer, {
      id: 'row-invalid',
      label: 'Broken',
    });

    const fields = extractVirtualDynamicFieldsContent(virtualContainer, createTraversalContext());

    expect(fields).toEqual([
      expect.objectContaining({
        id: 'field-row-ticket',
        label: 'Тикет',
        value: 'Ticket 42',
        valueType: 'link',
        linkRef: 'https://example.test/tickets/42',
      }),
    ]);
    expect(originalField.querySelector('a')?.getAttribute('data-sniptale-id')).toBe(
      'field-row-ticket'
    );
  });
}

function registerPreferredNestedValueTargetTest() {
  it('anchors styled dynamic fields to the deepest preferred value node', () => {
    const virtualContainer = document.createElement('div');
    appendDynamicField(virtualContainer, {
      id: 'row-cost',
      label: 'Стоимость',
      value: '1 250 000,00',
      nested: true,
    });

    const fields = extractVirtualDynamicFieldsContent(virtualContainer, createTraversalContext());
    const nestedValue = virtualContainer.querySelector('.DynamicValue__text');

    expect(fields).toEqual([
      expect.objectContaining({
        label: 'Стоимость',
        value: '1 250 000,00',
        sourceElement: nestedValue,
      }),
    ]);
    expect(nestedValue?.getAttribute('data-sniptale-id')).toBe('field-row-cost');
  });
}

function registerVirtualTextSerializationTest() {
  it('serializes virtual dynamic fields text and skips incomplete rows', () => {
    const virtualContainer = document.createElement('div');
    appendDynamicField(virtualContainer, {
      id: 'row-summary',
      label: 'Сводка',
      value: 'Готово',
      linkHref: 'https://example.test/summary',
    });
    appendDynamicField(virtualContainer, {
      id: 'row-empty',
      value: 'No label',
    });

    expect(extractVirtualDynamicFieldsText(virtualContainer)).toBe('Сводка: Готово');
  });
}

function registerIframeRejectionTests() {
  it('returns null for non-dynamic iframes and empty iframe documents', () => {
    const wrongIframe = document.createElement('iframe');
    wrongIframe.setAttribute('data-application-code', 'mvs');

    const emptyIframe = document.createElement('iframe');
    emptyIframe.setAttribute('data-application-code', 'dynamicFields');
    Object.defineProperty(emptyIframe, 'contentDocument', {
      configurable: true,
      value: createIframeDocument(),
    });

    expect(extractDynamicFieldsContent(wrongIframe, createTraversalContext())).toBeNull();
    expect(extractDynamicFieldsContent(emptyIframe, createTraversalContext())).toBeNull();
  });
}

function registerDynamicFieldNodeBuilderTest() {
  it('builds field nodes from extracted dynamic iframe fields', () => {
    const sourceElement = document.createElement('div');
    sourceElement.id = 'source-field';
    document.body.appendChild(sourceElement);

    expect(
      buildDynamicIframeFieldNodes([
        {
          id: 'field-source-field',
          label: 'Стоимость',
          linkRef: 'https://example.test/item',
          sourceElement,
          value: '1200',
          valueType: 'link',
        },
      ])
    ).toEqual([
      expect.objectContaining({
        evidence: [expect.objectContaining({ source: 'virtual-dom' })],
        id: 'field-source-field',
        label: 'Стоимость',
        value: '1200',
        valueType: 'link',
        linkRef: 'https://example.test/item',
      }),
    ]);
  });
}

describe('gwt dynamic fields helpers', () => {
  registerVirtualMirroringTest();
  registerPreferredNestedValueTargetTest();
  registerVirtualTextSerializationTest();
  registerIframeRejectionTests();
  registerDynamicFieldNodeBuilderTest();
});
