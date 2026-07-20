import type { TableRow } from '@sniptale/runtime-contracts/dom-tree';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  buildHeaderToCellMapping,
  findTargetCellByHeader,
  findTargetCellByNodeData,
} from './mapping';

const logger = createLogger({ namespace: 'ContentAiDomApplyTableTarget' });

export { shouldSkipComplexTableCell } from './cell-kind';

export function resolveTargetCell(rowElement: HTMLElement, tableRow: TableRow, columnName: string) {
  const table = rowElement.closest('table');
  if (!(table instanceof HTMLTableElement)) {
    logger.warn('Table not found for row');
    return null;
  }

  const headerToCellMap = buildHeaderToCellMapping(table, rowElement, logger);
  return (
    findTargetCellByHeader(headerToCellMap, columnName, logger) ??
    findTargetCellByNodeData(rowElement, tableRow, columnName, logger)
  );
}
