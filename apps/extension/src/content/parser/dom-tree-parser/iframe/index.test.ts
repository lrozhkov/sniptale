// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDOMTree } from '..';
import { extractVirtualIframeContent } from '../../parsers/gwt/attr-list-wide.helpers';
import { appendElement } from '../../../../../../../tooling/test/support/content/dom-tree-parser/iframe/dom.helpers';
import {
  buildDynamicFieldsIframe,
  buildEmbeddedDynamicFieldsSection,
} from '../../../../../../../tooling/test/support/content/dom-tree-parser/iframe/dynamic-fields.helpers';
import {
  buildRichTextChromeContainer,
  buildRichTextEditorIframe,
} from '../../../../../../../tooling/test/support/content/dom-tree-parser/iframe/rich-text.helpers';
import {
  setNaumenPortalPageContext,
  setNaumenSdPageContext,
  silenceParserLogging,
} from '../../../../../../../tooling/test/support/content/dom-tree-parser/iframe/context.helpers';

function expectVipStatusField() {
  const tree = parseDOMTree();
  const fields = tree.structure.flatMap((section) =>
    section.children.filter((child) => child.type === 'field')
  );

  expect(fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: 'VIP статус',
        value: 'Нет',
      }),
    ])
  );
}

function registerDynamicIframeTests() {
  it('parses dynamic fields rendered inside accessible iframes', () => {
    silenceParserLogging();
    setNaumenSdPageContext();
    buildDynamicFieldsIframe();

    expectVipStatusField();
  });

  it('embeds iframe content when only contentWindow.document is available', () => {
    silenceParserLogging();
    setNaumenSdPageContext();
    const iframe = buildDynamicFieldsIframe();
    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) {
      throw new Error('Expected iframe document');
    }

    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      get: () => null,
    });
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: { document: iframeDoc },
    });

    expectVipStatusField();
  });

  it('parses embedded dynamic fields iframe once without duplicate fields', () => {
    silenceParserLogging();
    setNaumenSdPageContext();
    buildEmbeddedDynamicFieldsSection();

    const tree = parseDOMTree();
    const fields = tree.structure.flatMap((section) =>
      section.children.filter((child) => child.type === 'field')
    );
    const vipFields = fields.filter(
      (child) => child.type === 'field' && child.label === 'VIP статус' && child.value === 'Нет'
    );

    expect(vipFields).toHaveLength(1);
    expect(JSON.stringify(tree)).toContain('Дополнительные параметры');
  });
}

function registerRichTextExtractionTests() {
  it('rejects rich-text editor iframe chrome from traversal output', () => {
    silenceParserLogging();
    setNaumenPortalPageContext();
    buildRichTextEditorIframe();

    const tree = parseDOMTree();
    const serialized = JSON.stringify(tree);

    expect(serialized).not.toContain('URL для перехода');
    expect(serialized).not.toContain('CTRL+Z');
    expect(serialized).not.toContain('Отменить последнюю команду');
  });

  it('extracts only editable content from virtual rich-text containers', () => {
    const virtualContainer = document.createElement('div');
    virtualContainer.setAttribute('data-virtual-iframe', 'true');
    virtualContainer.id = 'rtf-editor-virtual';

    const dialog = appendElement(virtualContainer, 'div', { className: 'note-link-dialog' });
    appendElement(dialog, 'label', { textContent: 'URL для перехода' });
    appendElement(dialog, 'input', { value: 'http://' });

    const editable = appendElement(virtualContainer, 'div', { className: 'note-editable' });
    appendElement(editable, 'p', {
      textContent: 'Требуется подбор кандидата на позицию разработчика программного обеспечения.',
    });

    const extracted = extractVirtualIframeContent(virtualContainer);

    expect(extracted).toContain('Требуется подбор кандидата');
    expect(extracted).not.toContain('URL для перехода');
  });
}

function registerGenericFormChromeTraversalTest() {
  it('does not let generic form-field parsing capture rich-text chrome descendants', () => {
    silenceParserLogging();
    setNaumenPortalPageContext();

    const fields = appendElement(document.body, 'div', { className: 'Details__fields' });
    const formGroup = appendElement(fields, 'div', { className: 'form-group' });
    appendElement(formGroup, 'label', { textContent: 'Номер заявки' });
    appendElement(formGroup, 'input', { value: 'SR-42' });

    const virtualIframe = appendElement(fields, 'div', {
      className: 'SummerNote__iframe',
      id: 'rtf-editor-72834',
    });
    virtualIframe.setAttribute('data-virtual-iframe', 'true');
    virtualIframe.setAttribute(
      'data-iframe-src',
      `${window.location.origin}/portal/summerNote.html`
    );
    buildRichTextChromeContainer(virtualIframe);

    const tree = parseDOMTree();
    const serialized = JSON.stringify(tree);

    expect(serialized).toContain('Номер заявки');
    expect(serialized).toContain('SR-42');
    expect(serialized).not.toContain('URL для перехода');
    expect(serialized).not.toContain('CTRL+Z');
  });
}

function registerDetailsHierarchyTraversalTest() {
  it('parses details hierarchical rows without reintroducing rich-text chrome', () => {
    silenceParserLogging();
    setNaumenPortalPageContext();

    const block = appendElement(document.body, 'div', { className: 'Block__block' });
    appendElement(block, 'div', { className: 'Title__title', textContent: 'Основные данные' });

    const table = appendElement(block, 'div', { className: 'Details__hierarchicalTable' });
    const statusRow = appendElement(table, 'div', { className: 'Details__row Details__rowLevel1' });
    appendElement(statusRow, 'div', {
      className: 'Details__colPage',
      textContent: 'Текущий статус',
    });
    appendElement(statusRow, 'div', { className: 'Details__colPage', textContent: 'В работе' });

    const descriptionRow = appendElement(table, 'div', {
      className: 'Details__row Details__rowLevel1',
    });
    appendElement(descriptionRow, 'div', {
      className: 'Details__colPage',
      textContent: 'Описание',
    });
    const descriptionValue = appendElement(descriptionRow, 'div', {
      className: 'Details__colPage',
    });
    const virtualIframe = appendElement(descriptionValue, 'div', {
      className: 'SummerNote__iframe',
      id: 'rtf-editor-29897',
    });
    virtualIframe.setAttribute('data-virtual-iframe', 'true');
    virtualIframe.setAttribute(
      'data-iframe-src',
      `${window.location.origin}/portal/summerNote.html`
    );
    buildRichTextChromeContainer(virtualIframe);

    const tree = parseDOMTree();
    const serialized = JSON.stringify(tree);

    expect(serialized).toContain('Текущий статус');
    expect(serialized).toContain('В работе');
    expect(serialized).toContain('Описание');
    expect(serialized).toContain('Требуется подбор кандидата');
    expect(serialized).not.toContain('URL для перехода');
    expect(serialized).not.toContain('CTRL+Z');
  });
}

describe('dom tree parser iframe support', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
    document.body.replaceChildren();
    document.title = '';
  });

  registerDynamicIframeTests();
  registerRichTextExtractionTests();
  registerGenericFormChromeTraversalTest();
  registerDetailsHierarchyTraversalTest();
});
