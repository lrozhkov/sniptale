// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableRow } from '@sniptale/runtime-contracts/dom-tree';

const { applyCommentEditMock, resolveTargetCellMock, shouldSkipComplexTableCellMock } = vi.hoisted(
  () => ({
    applyCommentEditMock: vi.fn(),
    resolveTargetCellMock: vi.fn(),
    shouldSkipComplexTableCellMock: vi.fn(),
  })
);

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal()),
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('./comment', () => ({
  applyCommentEdit: applyCommentEditMock,
}));

vi.mock('./table-target', () => ({
  resolveTargetCell: resolveTargetCellMock,
  shouldSkipComplexTableCell: shouldSkipComplexTableCellMock,
}));

import { applyTableEdit } from './table';

function createTableRow(overrides: Partial<TableRow> = {}): TableRow {
  return {
    data: { Название: 'Старое значение' },
    id: 'row-1',
    selected: true,
    selector: '[data-row="1"]',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  shouldSkipComplexTableCellMock.mockReturnValue(false);
});

describe('ai-pick table helper comment routing', () => {
  it('delegates comment rows to the comment helper', () => {
    const rowElement = document.createElement('div');
    rowElement.id = 'comment$123';
    const updateTextPreservingStructure = vi.fn();

    applyTableEdit(
      rowElement,
      'Текст',
      'Новый комментарий',
      createTableRow({ data: { Текст: 'Старый комментарий' } }),
      updateTextPreservingStructure
    );

    expect(applyCommentEditMock).toHaveBeenCalledWith(
      rowElement,
      'Текст',
      'Новый комментарий',
      updateTextPreservingStructure
    );
    expect(resolveTargetCellMock).not.toHaveBeenCalled();
  });
});

describe('ai-pick table helper cell updates', () => {
  it('updates link cells through the shared text updater', () => {
    const rowElement = document.createElement('tr');
    const targetCell = document.createElement('td');
    const link = document.createElement('a');
    link.textContent = 'Старое значение';
    targetCell.appendChild(link);
    const updateTextPreservingStructure = vi.fn();
    resolveTargetCellMock.mockReturnValue(targetCell);

    applyTableEdit(
      rowElement,
      'Название',
      'Новое значение',
      createTableRow(),
      updateTextPreservingStructure
    );

    expect(updateTextPreservingStructure).toHaveBeenCalledWith(link, 'Новое значение');
  });
});

describe('ai-pick table helper structured cell updates', () => {
  it('updates structured table cells through .stringView and respects complex-cell skips', () => {
    const rowElement = document.createElement('tr');
    const targetCell = document.createElement('td');
    const stringView = document.createElement('span');
    stringView.className = 'stringView';
    targetCell.appendChild(stringView);
    const updateTextPreservingStructure = vi.fn();
    resolveTargetCellMock.mockReturnValue(targetCell);

    applyTableEdit(
      rowElement,
      'Название',
      'Новое значение',
      createTableRow(),
      updateTextPreservingStructure
    );

    expect(updateTextPreservingStructure).toHaveBeenCalledWith(stringView, 'Новое значение');

    updateTextPreservingStructure.mockClear();
    shouldSkipComplexTableCellMock.mockReturnValue(true);

    applyTableEdit(
      rowElement,
      'Название',
      'Пропустить',
      createTableRow(),
      updateTextPreservingStructure
    );

    expect(updateTextPreservingStructure).not.toHaveBeenCalled();
  });
});
