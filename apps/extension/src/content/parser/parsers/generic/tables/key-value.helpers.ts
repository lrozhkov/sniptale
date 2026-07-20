import type { TableRow } from '@sniptale/runtime-contracts/dom-tree';
import { generateStableId } from '../../../dom-utils/id-generator';
import {
  determineValueType,
  extractCleanText,
  getSelector,
  isElementVisible,
  setSniptaleId,
} from '../../../dom-utils/dom-helpers';
import type { TraversalContext } from '../../types';

export function resolveTableHeaderRow(table: HTMLTableElement) {
  const thead = table.querySelector('thead');
  if (thead) {
    return thead.querySelector('tr');
  }

  const firstRow = table.querySelector('tr:first-child');
  if (firstRow && firstRow.querySelectorAll('th').length > 0) {
    return firstRow as HTMLTableRowElement;
  }

  return null;
}

export function extractTableHeaders(headerRow: HTMLTableRowElement) {
  const headers: string[] = [];
  const headerCells = headerRow.querySelectorAll('th');

  headerCells.forEach((th) => {
    const text = extractCleanText(th as HTMLElement);
    if (text) {
      headers.push(text);
    }
  });

  return headers;
}

function extractRowData(cells: NodeListOf<HTMLTableCellElement>, headers: string[]) {
  const rowData: Record<string, string> = {};
  const cellTypes: Record<string, 'string' | 'link' | 'number' | 'boolean' | 'image' | 'status'> =
    {};

  cells.forEach((cell, i) => {
    const header = headers[i];
    if (header === undefined) return;

    const value = extractCleanText(cell as HTMLElement);
    const cellType = determineValueType(cell as HTMLElement);
    rowData[header] = value;
    cellTypes[header] = cellType;
  });

  return { cellTypes, rowData };
}

function hasRowValue(rowData: Record<string, string>) {
  return Object.values(rowData).some((value) => value && value.trim().length > 0);
}

export function extractDataTableRows(props: {
  ctx: TraversalContext;
  headerRow: HTMLTableRowElement;
  headers: string[];
  table: HTMLTableElement;
}) {
  const rows: TableRow[] = [];
  const tbody = props.table.querySelector('tbody') || props.table;
  const dataRows = tbody.querySelectorAll('tr');

  dataRows.forEach((row, rowIndex) => {
    if (row === props.headerRow) return;
    if (!isElementVisible(row as HTMLElement)) return;

    const cells = row.querySelectorAll('td');
    if (cells.length === 0) return;

    const { cellTypes, rowData } = extractRowData(cells, props.headers);
    if (Object.keys(rowData).length === 0 || !hasRowValue(rowData)) {
      return;
    }

    const stableId = generateStableId('row', row as HTMLElement, rowIndex);
    setSniptaleId(row as HTMLElement, stableId);

    rows.push({
      id: stableId,
      selected: true,
      data: rowData,
      cellTypes,
      selector: getSelector(row as HTMLElement) ?? '',
    });
  });

  return rows;
}
