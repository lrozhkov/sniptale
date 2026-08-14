// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const insertMetaStampMock = vi.hoisted(() => vi.fn());
const useAppLocaleMock = vi.hoisted(() => vi.fn(() => 'en'));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: useAppLocaleMock,
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useEditorController: () => ({
    insertTechnicalData: insertMetaStampMock,
  }),
}));

import { EditorInspectorMetaPanelContent } from './meta';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderMetaPanel() {
  act(() => {
    root?.render(<EditorInspectorMetaPanelContent />);
  });
}

function getOptionButtons() {
  return Array.from(
    container?.querySelectorAll<HTMLButtonElement>(
      '[aria-label="editor.compact.technicalDataFields"] > button[aria-pressed]'
    ) ?? []
  );
}

function getAddButton() {
  return Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === 'editor.compact.technicalDataInsert'
  );
}

function getLayoutToggle() {
  return Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === 'editor.compact.technicalDataLayoutRow'
  );
}

function selectTechnicalDataInColumnOrder(options: HTMLButtonElement[]) {
  options[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  options[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  options[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('meta panel content', () => {
  it('binds locale and dispatches ordered technical-data insertions', () => {
    renderMetaPanel();

    expect(useAppLocaleMock).toHaveBeenCalled();

    const options = getOptionButtons();
    const addButton = getAddButton();

    expect(options).toHaveLength(3);
    expect(container?.textContent).not.toContain('editor.compact.technicalDataDescription');
    expect(getExactTextNodeCount('editor.compact.technicalData')).toBe(0);
    expect(container?.textContent).toContain('editor.compact.technicalDataLayoutColumn');
    expect(container?.textContent).toContain('editor.compact.technicalDataPreviewEmpty');
    expect(addButton?.hasAttribute('disabled')).toBe(true);
    expectTechnicalDataRowsToBeFlat(options);

    act(() => selectTechnicalDataInColumnOrder(options));

    expect(addButton?.hasAttribute('disabled')).toBe(false);
    expect(container?.textContent).toContain('editor.compact.pageUrl');
    expect(container?.textContent).toContain('editor.compact.dateTime');
    expect(container?.textContent).toContain('editor.compact.browser');

    addButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(insertMetaStampMock).toHaveBeenCalledWith(['url', 'date', 'browser'], 'column');
  });

  it('can insert technical data in a single-row layout', () => {
    renderMetaPanel();

    const layoutToggle = getLayoutToggle();
    const options = getOptionButtons();
    const addButton = getAddButton();

    act(() => {
      layoutToggle?.click();
      options[0]?.click();
      options[2]?.click();
    });

    expect(container?.textContent).toContain('editor.compact.technicalDataLayoutRow');
    expect(container?.textContent).toContain('·');

    act(() => {
      addButton?.click();
    });

    expect(insertMetaStampMock).toHaveBeenCalledWith(['url', 'browser'], 'row');
  });
});

function getExactTextNodeCount(text: string): number {
  return Array.from(container?.querySelectorAll('*') ?? []).filter(
    (element) => element.childNodes.length === 1 && element.textContent === text
  ).length;
}

function expectTechnicalDataRowsToBeFlat(options: HTMLButtonElement[]) {
  for (const option of options) {
    expect(option.className).not.toContain('border ');
    expect(option.className).not.toContain('border-[color');
  }
}
