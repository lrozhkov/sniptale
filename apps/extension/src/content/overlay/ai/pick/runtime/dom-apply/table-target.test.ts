// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { determineCellTypeFromDOMMock, isTechnicalCellMock } = vi.hoisted(() => ({
  determineCellTypeFromDOMMock: vi.fn(),
  isTechnicalCellMock: vi.fn(),
}));

vi.mock('./cell', () => ({
  determineCellTypeFromDOM: determineCellTypeFromDOMMock,
  isTechnicalCell: isTechnicalCellMock,
}));

import { resolveTargetCell, shouldSkipComplexTableCell } from './table-target';

function createTableFixture() {
  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th></th>
        <th>Автор</th>
        <th>Дата</th>
        <th>Текст комментария</th>
      </tr>
    </thead>
    <tbody>
      <tr data-row="1">
        <td><input type="checkbox" /></td>
        <td data-cell="author">Лев</td>
        <td data-cell="date">31.03.2026</td>
        <td data-cell="text">Старый текст</td>
      </tr>
    </tbody>
  `;
  document.body.appendChild(table);
  return table.querySelector('tr[data-row="1"]') as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

function mockRowCellsAsTechnicalThenData() {
  isTechnicalCellMock
    .mockReturnValueOnce({ isTechnical: true, type: 'select-box' })
    .mockReturnValueOnce({ isTechnical: false, type: 'data' })
    .mockReturnValueOnce({ isTechnical: false, type: 'data' })
    .mockReturnValueOnce({ isTechnical: false, type: 'data' });
}

function verifyHeaderPartialMatchResolution() {
  const rowElement = createTableFixture();
  const bodyCells = rowElement.querySelectorAll('td');
  mockRowCellsAsTechnicalThenData();

  const targetCell = resolveTargetCell(
    rowElement,
    {
      data: { Автор: 'Лев', Дата: '31.03.2026', Текст: 'Старый текст' },
      id: 'row-1',
      selected: true,
      selector: '[data-row="1"]',
    },
    'Текст'
  );

  expect(targetCell).toBe(bodyCells[3]);
}

function verifyFallbackDataCellIndexResolution() {
  const rowElement = createTableFixture();
  const bodyCells = rowElement.querySelectorAll('td');
  mockRowCellsAsTechnicalThenData();

  const targetCell = resolveTargetCell(
    rowElement,
    {
      data: { Автор: 'Лев', Дата: '31.03.2026' },
      id: 'row-1',
      selected: true,
      selector: '[data-row="1"]',
    },
    'Дата'
  );

  expect(targetCell).toBe(bodyCells[2]);
}

function verifyDetachedRowReturnsNull() {
  const rowElement = document.createElement('tr');
  rowElement.innerHTML = '<td>Detached</td>';

  expect(
    resolveTargetCell(
      rowElement,
      {
        data: { Автор: 'Лев' },
        id: 'row-1',
        selected: true,
        selector: '[data-row="1"]',
      },
      'Дата'
    )
  ).toBeNull();
}

function verifyComplexCellsAreSkipped() {
  const targetCell = document.createElement('td');
  determineCellTypeFromDOMMock.mockReturnValue('image');

  expect(
    shouldSkipComplexTableCell(
      {
        data: { Фото: 'avatar.png' },
        id: 'row-1',
        selected: true,
        selector: '[data-row="1"]',
      },
      targetCell,
      'Фото'
    )
  ).toBe(true);
}

function verifySafeCellsStayEditable() {
  const targetCell = document.createElement('td');

  expect(
    shouldSkipComplexTableCell(
      {
        data: { Автор: 'Лев' },
        cellTypes: { Автор: 'string' },
        id: 'row-1',
        selected: true,
        selector: '[data-row="1"]',
      },
      targetCell,
      'Автор'
    )
  ).toBe(false);
  expect(determineCellTypeFromDOMMock).not.toHaveBeenCalled();
}

describe('ai-pick table target helpers', () => {
  it(
    'resolves cells through header partial match while skipping technical columns',
    verifyHeaderPartialMatchResolution
  );

  it(
    'falls back to non-technical data-cell index when no header match exists',
    verifyFallbackDataCellIndexResolution
  );
});

describe('ai-pick table target fallback helpers', () => {
  it('returns null when the row does not belong to a table', verifyDetachedRowReturnsNull);

  it(
    'skips complex table cells when the resolved type is image or status',
    verifyComplexCellsAreSkipped
  );

  it(
    'keeps simple table cells editable when row metadata already carries a safe type',
    verifySafeCellsStayEditable
  );
});
