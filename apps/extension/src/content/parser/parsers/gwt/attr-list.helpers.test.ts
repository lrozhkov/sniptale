// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { setGetOriginalElementFn } from '../../dom-utils/dom-helpers';
import { parseAttributes } from './attr-list.helpers';
import { extractVirtualDynamicFieldsContent } from './attr-list-dynamic-fields.helpers';
import type { TraversalContext } from '../types';

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

function ensureIframeDocument(iframe: HTMLIFrameElement) {
  const iframeDoc = iframe.contentDocument;
  const iframeWindow = iframe.contentWindow;
  if (!iframeDoc || !iframeWindow) {
    throw new Error('Expected iframe document');
  }

  Object.defineProperty(iframeWindow, 'frameElement', {
    configurable: true,
    value: iframe,
  });

  return iframeDoc;
}

function buildDynamicFieldsAttrList() {
  const table = document.createElement('table');
  table.className = 'attrList';
  const tbody = document.createElement('tbody');
  const row = document.createElement('tr');
  const wideCell = document.createElement('td');
  wideCell.className = 'attrWide';

  const caption = document.createElement('div');
  caption.id = 'gwt-debug-extra-caption';
  caption.textContent = 'Дополнительные параметры:';

  const value = document.createElement('div');
  value.id = 'gwt-debug-extra-value';

  const iframe = document.createElement('iframe');
  iframe.id = 'iframe$dynamic-fields';
  iframe.setAttribute('data-application-code', 'dynamicFields');
  value.append(iframe);
  wideCell.append(caption, value);
  row.append(wideCell);
  tbody.append(row);
  table.append(tbody);
  document.body.append(table);

  const iframeDoc = ensureIframeDocument(iframe);
  const field = iframeDoc.createElement('div');
  field.id = 'row-dynamic-field';
  field.className = 'FormField-EA__field FormField-EA__fieldRead';
  const fieldInfo = iframeDoc.createElement('div');
  fieldInfo.className = 'FormField-EA__fieldInfo';
  const label = iframeDoc.createElement('span');
  label.textContent = 'VIP статус';
  fieldInfo.append(label);
  const fieldBody = iframeDoc.createElement('div');
  fieldBody.className = 'FormField-EA__fieldBody';
  const link = iframeDoc.createElement('a');
  link.href = '#vip-status';
  link.textContent = 'Нет';
  fieldBody.append(link);
  field.append(fieldInfo, fieldBody);
  iframeDoc.body.append(field);

  return { iframe, table };
}

function createStyledDynamicFieldsTableShell() {
  const table = document.createElement('table');
  table.className = 'attrList';
  const tbody = document.createElement('tbody');
  const row = document.createElement('tr');
  const wideCell = document.createElement('td');
  wideCell.className = 'attrWide';

  const caption = document.createElement('div');
  caption.id = 'gwt-debug-extra-caption';
  caption.textContent = 'Дополнительные параметры:';

  const value = document.createElement('div');
  value.id = 'gwt-debug-extra-value';

  const iframe = document.createElement('iframe');
  iframe.id = 'iframe$dynamic-fields-styled';
  iframe.setAttribute('data-application-code', 'dynamicFields');
  value.append(iframe);
  wideCell.append(caption, value);
  row.append(wideCell);
  tbody.append(row);
  table.append(tbody);
  document.body.append(table);
  return { iframe, table };
}

function populateStyledDynamicFieldsIframe(iframe: HTMLIFrameElement) {
  const iframeDoc = ensureIframeDocument(iframe);
  const field = iframeDoc.createElement('div');
  field.id = 'row-dynamic-field-styled';
  field.className = 'FormField-EA__field FormField-EA__fieldRead';
  const fieldInfo = iframeDoc.createElement('div');
  fieldInfo.className = 'FormField-EA__fieldInfo';
  const label = iframeDoc.createElement('span');
  label.textContent = 'Стоимость';
  fieldInfo.append(label);
  const fieldBody = iframeDoc.createElement('div');
  fieldBody.className = 'FormField-EA__fieldBody';
  const controlBox = iframeDoc.createElement('div');
  controlBox.className = 'FormField-EA__controlBox';
  const control = iframeDoc.createElement('div');
  control.className = 'FormField-EA__control';
  const layout = iframeDoc.createElement('div');
  layout.className = 'DynamicValue__layout';
  const content = iframeDoc.createElement('div');
  content.className = 'DynamicValue__content';
  const text = iframeDoc.createElement('span');
  text.className = 'DynamicValue__text';
  text.textContent = '1 250 000,00';

  content.append(text);
  layout.append(content);
  control.append(layout);
  controlBox.append(control);
  fieldBody.append(controlBox);
  field.append(fieldInfo, fieldBody);
  iframeDoc.body.append(field);
}

function buildStyledDynamicFieldsAttrList() {
  const { iframe, table } = createStyledDynamicFieldsTableShell();
  populateStyledDynamicFieldsIframe(iframe);
  return { iframe, table };
}

function expectStyledDynamicFieldAnchoring(
  iframe: HTMLIFrameElement,
  fields: ReturnType<typeof parseAttributes>
) {
  expect(fields).toEqual([
    expect.objectContaining({
      label: 'Стоимость',
      value: '1 250 000,00',
    }),
  ]);

  const firstField = fields[0];
  expect(
    iframe.contentDocument?.querySelector('.DynamicValue__text')?.getAttribute('data-sniptale-id')
  ).toBe(firstField?.id);
  expect(
    iframe.contentDocument
      ?.querySelector('.FormField-EA__controlBox')
      ?.getAttribute('data-sniptale-id')
  ).toBeNull();
}

function registerDynamicIframeAnchoringTest() {
  it('anchors dynamic iframe fields to their inner elements', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { iframe, table } = buildDynamicFieldsAttrList();
    const fields = parseAttributes(table, createTraversalContext());

    expect(fields).toEqual([
      expect.objectContaining({
        label: 'VIP статус',
        linkRef: expect.stringContaining('#vip-status'),
        selector: expect.any(String),
        value: 'Нет',
      }),
    ]);

    const firstField = fields[0];
    const originalField = iframe.contentDocument?.getElementById(
      'row-dynamic-field'
    ) as HTMLElement | null;
    expect(originalField?.dataset['sniptaleId']).toBeUndefined();
    expect(
      iframe.contentDocument
        ?.querySelector('.FormField-EA__fieldBody a')
        ?.getAttribute('data-sniptale-id')
    ).toBe(firstField?.id);
    expect(
      document.querySelector(`#gwt-debug-extra-value[data-sniptale-id="${firstField?.id ?? ''}"]`)
    ).toBeNull();
  });
}

function registerVirtualMirroringTest() {
  it('mirrors sniptale ids back to original iframe fields for virtual dynamic fields', () => {
    const { iframe } = buildDynamicFieldsAttrList();
    const iframeDoc = iframe.contentDocument;
    const originalField = iframeDoc?.getElementById('row-dynamic-field') as HTMLElement | null;
    if (!originalField) {
      throw new Error('Expected original dynamic field');
    }

    const virtualContainer = document.createElement('div');
    const virtualField = originalField.cloneNode(true) as HTMLElement;
    virtualContainer.append(virtualField);

    const ctx = createTraversalContext();
    ctx.getOriginalElementFn = (node: Node) => (node === virtualField ? originalField : null);

    const fields = extractVirtualDynamicFieldsContent(virtualContainer, ctx);
    expect(fields).not.toBeNull();
    expect(fields?.[0]?.id).toBe('field-row-dynamic-field');
    expect(originalField.dataset['sniptaleId']).toBeUndefined();
    expect(
      originalField.querySelector('.FormField-EA__fieldBody a')?.getAttribute('data-sniptale-id')
    ).toBe('field-row-dynamic-field');
  });
}

function registerStyledAnchoringTest() {
  it('anchors styled dynamic iframe fields to the deepest text node instead of the control box', () => {
    const { iframe, table } = buildStyledDynamicFieldsAttrList();
    const fields = parseAttributes(table, createTraversalContext());

    expectStyledDynamicFieldAnchoring(iframe, fields);
  });
}

describe('gwt attr list iframe fields', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
    setGetOriginalElementFn((node) => node);
  });

  registerDynamicIframeAnchoringTest();
  registerVirtualMirroringTest();
  registerStyledAnchoringTest();
});
