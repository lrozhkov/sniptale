// @vitest-environment jsdom

import { expect } from 'vitest';
import type { FieldNode, ParsedDOMTree, TableNode } from '@sniptale/runtime-contracts/dom-tree';
import type { buildElementMaps } from './dom-helpers';
import { getDataCount, getDataIdsForElement, getElementCount } from './dom-helpers';

export function createIframeTarget() {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument;
  const iframeWindow = iframe.contentWindow;
  if (!iframeDoc || !iframeWindow) {
    throw new Error('Expected iframe document');
  }

  Object.defineProperty(iframeWindow, 'frameElement', {
    configurable: true,
    value: iframe,
  });

  const target = iframeDoc.createElement('div');
  iframeDoc.body.appendChild(target);

  return { iframe, target };
}

export function buildTree(fieldId: string): ParsedDOMTree {
  const field: FieldNode = {
    id: fieldId,
    label: 'Iframe data',
    selected: true,
    type: 'field',
    value: 'Example',
    valueType: 'string',
  };

  return {
    context: 'test',
    title: 'Test',
    structure: [
      {
        children: [field],
        id: 'section-1',
        selected: true,
        title: 'Section',
        type: 'section',
      },
    ],
  };
}

export function buildComplexTree(): ParsedDOMTree {
  const table: TableNode = {
    headers: ['Name'],
    id: 'table-1',
    rows: [
      {
        data: { Name: 'Row value' },
        id: 'row-1',
        selected: true,
        selector: '[data-row="1"]',
      },
    ],
    selected: true,
    type: 'table',
  };

  const field: FieldNode = {
    id: 'field-selector-fallback',
    label: 'Selector field',
    selected: true,
    selector: '[data-field-fallback="true"]',
    type: 'field',
    value: 'Fallback',
    valueType: 'string',
  };

  return {
    context: 'test',
    title: 'Complex Test',
    structure: [
      {
        children: [field, table],
        id: 'section-by-id',
        selected: true,
        targetRef: {
          anchorStrategy: 'selector-chain',
          editable: false,
          realmId: 'realm-1',
          selectors: ['#missing-section-target', '#section-target'],
        },
        title: 'Section',
        type: 'section',
      },
    ],
  };
}

export function createMappingFallbackScenario() {
  const bodySection = document.createElement('section');
  bodySection.id = 'section-target';

  const nestedTarget = document.createElement('div');
  nestedTarget.id = 'nested-target';
  const fieldFallback = document.createElement('div');
  fieldFallback.dataset['fieldFallback'] = 'true';

  const tableElement = document.createElement('table');
  tableElement.id = 'table-1';
  const rowElement = document.createElement('tr');
  rowElement.dataset['row'] = '1';

  const fieldByAttr = document.createElement('div');
  fieldByAttr.dataset['sniptaleId'] = 'field-by-attr';

  rowElement.append(fieldByAttr);
  tableElement.append(rowElement);
  bodySection.append(nestedTarget, fieldFallback, tableElement);
  document.body.append(bodySection);

  return { bodySection, nestedTarget, rowElement };
}

export function appendAttributeFallbackField(complexTree: ParsedDOMTree) {
  const section = complexTree.structure[0];
  if (!section) {
    throw new Error('Expected complex tree section');
  }

  section.children.push({
    id: 'field-by-attr',
    label: 'Attribute field',
    selected: true,
    type: 'field',
    value: 'Mapped through data attribute',
    valueType: 'string',
  });
}

export function expectMappingFallbackCounts(
  elementIndex: ReturnType<typeof import('./dom-index').createAiPickElementIndex>,
  counts: ReturnType<typeof buildElementMaps>
) {
  expect(counts).toEqual({
    dataCount: 4,
    elementCount: 5,
  });
  expect(getElementCount(elementIndex)).toBe(5);
  expect(getDataCount(elementIndex)).toBe(4);
}

export function expectMappingFallbackTargets(args: {
  bodySection: HTMLElement;
  elementIndex: ReturnType<typeof import('./dom-index').createAiPickElementIndex>;
  rowElement: HTMLElement;
}) {
  expect(Array.from(getDataIdsForElement(args.elementIndex, args.bodySection))).toEqual(
    expect.arrayContaining([
      'section-by-id',
      'field-selector-fallback',
      'table-1',
      'row-1',
      'field-by-attr',
    ])
  );
  expect(Array.from(getDataIdsForElement(args.elementIndex, args.rowElement))).toEqual(
    expect.arrayContaining(['row-1', 'field-by-attr'])
  );
}
