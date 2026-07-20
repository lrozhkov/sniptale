import type { TableRow } from '@sniptale/runtime-contracts/dom-tree';
import { generateStableId } from '../../dom-utils/id-generator';
import {
  determineValueType,
  extractCleanText,
  extractImageText,
  getSelector,
  isElementVisible,
  setSniptaleId,
} from '../../dom-utils/dom-helpers';

function extractHeaders(headerRow: HTMLTableRowElement) {
  const headers: string[] = [];
  const headerIndices: number[] = [];

  headerRow.querySelectorAll('th').forEach((th, index) => {
    const text = extractCleanText(th as HTMLElement);
    if (text && !text.match(/^[▾▲◇☰]$/)) {
      headers.push(text);
      headerIndices.push(index);
    }
  });

  return { headerIndices, headers, totalHeaderCells: headerRow.querySelectorAll('th').length };
}

function buildRowData(
  cells: NodeListOf<HTMLTableCellElement>,
  headers: string[],
  headerIndices: number[],
  totalHeaderCells: number
) {
  const rowData: Record<string, string> = {};
  const cellTypes: Record<string, 'string' | 'link' | 'number' | 'boolean' | 'image' | 'status'> =
    {};

  const cellPairs =
    cells.length === totalHeaderCells
      ? headerIndices.map((headerIndex, index) => ({
          cell: cells[headerIndex],
          header: headers[index],
        }))
      : headers
          .map((header, index) => ({ cell: cells[index], header }))
          .filter((entry) => entry.cell);

  cellPairs.forEach(({ cell, header }) => {
    if (!cell || !header) {
      return;
    }
    const cellContent = cell.querySelector('.cellInsider, .stringView') || cell;
    rowData[header] = extractImageText(cellContent as HTMLElement);
    cellTypes[header] = determineValueType(cell as HTMLElement);
  });

  return { cellTypes, rowData };
}

function buildTableRow(
  row: HTMLTableRowElement,
  rowIndex: number,
  headers: string[],
  headerIndices: number[],
  totalHeaderCells: number
): TableRow | null {
  if (!isElementVisible(row as HTMLElement)) {
    return null;
  }

  const cells = row.querySelectorAll('td');
  const { cellTypes, rowData } = buildRowData(cells, headers, headerIndices, totalHeaderCells);
  if (Object.keys(rowData).length === 0) {
    return null;
  }

  const stableId = generateStableId('row', row as HTMLElement, rowIndex);
  setSniptaleId(row as HTMLElement, stableId);

  return {
    id: stableId,
    selected: true,
    data: rowData,
    cellTypes,
    selector: getSelector(row as HTMLElement),
  };
}

export function parseGwtTableRows(
  tableElement: HTMLTableElement,
  headers: string[],
  headerIndices: number[],
  totalHeaderCells: number
) {
  return Array.from(tableElement.querySelectorAll('tbody tr.tableRow, tbody tr'))
    .map((row, rowIndex) =>
      buildTableRow(row as HTMLTableRowElement, rowIndex, headers, headerIndices, totalHeaderCells)
    )
    .filter((row): row is TableRow => row !== null);
}

export function filterNonEmptyRows(rows: TableRow[]) {
  return rows.filter((row) =>
    Object.values(row.data).some((value) => value && value.trim().length > 0)
  );
}

export function extractTableHeaders(tableElement: HTMLTableElement) {
  const headerRow = tableElement.querySelector('thead tr');
  if (!headerRow) {
    return null;
  }

  const headerData = extractHeaders(headerRow as HTMLTableRowElement);
  return headerData.headers.length > 0 ? headerData : null;
}
