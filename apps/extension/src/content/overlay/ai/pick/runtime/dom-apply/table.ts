import type { TableRow } from '@sniptale/runtime-contracts/dom-tree';
import { createLogger } from '@sniptale/platform/observability/logger';
import { applyCommentEdit } from './comment';
import { resolveTargetCell, shouldSkipComplexTableCell } from './table-target';

const logger = createLogger({ namespace: 'ContentAiDomApplyTable' });

function isCommentRowElement(rowElement: HTMLElement) {
  return (
    rowElement.id?.startsWith('comment$') ||
    rowElement.classList.contains('GAQEVERBV') ||
    rowElement.hasAttribute('data-comment-row')
  );
}

function logTableEditStart(
  rowElement: HTMLElement,
  columnName: string,
  newValue: string,
  tableRow: TableRow
) {
  logger.debug('Starting table edit', {
    columnName,
    newValue,
    rowElementTag: rowElement.tagName,
    rowElementId: rowElement.id,
    id: tableRow.id,
    data: tableRow.data,
    cellTypes: tableRow.cellTypes,
  });
}

function applyValueToTableCell(
  targetCell: HTMLElement,
  newValue: string,
  updateTextPreservingStructure: (element: HTMLElement, newValue: string) => void
) {
  const link = targetCell.querySelector('a');
  if (link) {
    updateTextPreservingStructure(link as HTMLElement, newValue);
    logger.debug('Updated link text in table cell', newValue);
    return;
  }

  const target = targetCell.querySelector('.stringView, .cellInsider') || targetCell;
  updateTextPreservingStructure(target as HTMLElement, newValue);
  logger.debug('Updated table cell', newValue);
}

export function applyTableEdit(
  rowElement: HTMLElement,
  columnName: string,
  newValue: string,
  tableRow: TableRow,
  updateTextPreservingStructure: (element: HTMLElement, newValue: string) => void
): boolean {
  logTableEditStart(rowElement, columnName, newValue, tableRow);

  if (isCommentRowElement(rowElement)) {
    logger.debug('Detected comment row, using comment-specific logic');
    return applyCommentEdit(rowElement, columnName, newValue, updateTextPreservingStructure);
  }

  const targetCell = resolveTargetCell(rowElement, tableRow, columnName);
  if (!targetCell) {
    logger.warn('Cell not found for column, skipping', columnName);
    return false;
  }

  if (shouldSkipComplexTableCell(tableRow, targetCell, columnName)) {
    return false;
  }

  applyValueToTableCell(targetCell, newValue, updateTextPreservingStructure);
  return true;
}
