// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const { buildHeaderToCellMappingMock, findTargetCellByHeaderMock, findTargetCellByNodeDataMock } =
  vi.hoisted(() => ({
    buildHeaderToCellMappingMock: vi.fn(),
    findTargetCellByHeaderMock: vi.fn(),
    findTargetCellByNodeDataMock: vi.fn(),
  }));

vi.mock('./mapping', () => ({
  buildHeaderToCellMapping: buildHeaderToCellMappingMock,
  findTargetCellByHeader: findTargetCellByHeaderMock,
  findTargetCellByNodeData: findTargetCellByNodeDataMock,
}));

import { resolveTargetCell, shouldSkipComplexTableCell } from '.';
import { shouldSkipComplexTableCell as canonicalShouldSkipComplexTableCell } from './cell-kind';

beforeEach(() => {
  buildHeaderToCellMappingMock.mockReset();
  findTargetCellByHeaderMock.mockReset();
  findTargetCellByNodeDataMock.mockReset();
});

it('warns and returns null when the row is detached from a table', () => {
  const rowElement = document.createElement('tr');

  expect(
    resolveTargetCell(
      rowElement,
      {
        data: { Автор: 'Лев' },
        id: 'row-1',
        selected: true,
        selector: '[data-row="1"]',
      },
      'Автор'
    )
  ).toBeNull();
});

it('uses mapping lookup before falling back to node-data lookup', () => {
  const table = document.createElement('table');
  const rowElement = document.createElement('tr');
  const targetCell = document.createElement('td');
  table.appendChild(document.createElement('tbody')).appendChild(rowElement);

  findTargetCellByHeaderMock.mockReturnValue(null);
  findTargetCellByNodeDataMock.mockReturnValue(targetCell);

  expect(
    resolveTargetCell(
      rowElement,
      {
        data: { Автор: 'Лев' },
        id: 'row-1',
        selected: true,
        selector: '[data-row="1"]',
      },
      'Автор'
    )
  ).toBe(targetCell);
  expect(buildHeaderToCellMappingMock).toHaveBeenCalledWith(table, rowElement, expect.any(Object));
  expect(findTargetCellByHeaderMock).toHaveBeenCalled();
  expect(findTargetCellByNodeDataMock).toHaveBeenCalled();
});

it('re-exports the canonical cell-kind helper', () => {
  expect(shouldSkipComplexTableCell).toBe(canonicalShouldSkipComplexTableCell);
});
