import type { TableRow } from '@sniptale/runtime-contracts/dom-tree';
import { createLogger } from '@sniptale/platform/observability/logger';
import { determineCellTypeFromDOM } from '../cell';

const logger = createLogger({ namespace: 'ContentAiDomApplyTableTarget' });

export function shouldSkipComplexTableCell(
  tableRow: TableRow,
  targetCell: HTMLElement,
  columnName: string
) {
  const cellType = tableRow.cellTypes?.[columnName] ?? determineCellTypeFromDOM(targetCell);
  logger.debug('Resolved cell type for table edit', {
    columnName,
    cellType,
    resolvedFromDom: !tableRow.cellTypes?.[columnName],
  });

  if (cellType === 'image' || cellType === 'status') {
    logger.debug('Skipping complex table cell', { columnName, cellType });
    return true;
  }

  return false;
}
