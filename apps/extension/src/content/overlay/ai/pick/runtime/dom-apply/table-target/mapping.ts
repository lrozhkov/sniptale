import type { TableRow } from '@sniptale/runtime-contracts/dom-tree';
import type { Logger } from '@sniptale/platform/observability/logger/types';
import { isTechnicalCell } from '../cell';

type TableTargetCell = { cellIndex: number; cell: HTMLElement };
type HeaderPosition = { headerText: string; cellIndex: number; cell: HTMLElement };

function logHeaderMappingInputs(args: {
  bodyCells: Element[];
  cellTypes: Array<{ idx: number; type: string }>;
  headerCells: Element[];
  headerTypes: Array<{ idx: number; text: string; isTechnical: boolean }>;
  logger: Pick<Logger, 'debug'>;
}): void {
  args.logger.debug('Building header-to-cell mapping', {
    headerCount: args.headerCells.length,
    cellCount: args.bodyCells.length,
    cellTypes: args.cellTypes.map((cell) => `${cell.idx}:${cell.type}`),
    headerTypes: args.headerTypes.map(
      (header) => `${header.idx}:${header.isTechnical ? 'tech' : header.text}`
    ),
  });
}

function appendValidHeaderPosition(args: {
  cell: Element | undefined;
  cellType: ReturnType<typeof isTechnicalCell> & { idx: number };
  headerType: { idx: number; text: string; isTechnical: boolean };
  index: number;
  logger: Pick<Logger, 'debug'>;
  validPositions: HeaderPosition[];
}): void {
  if (!(args.cell instanceof HTMLElement)) {
    return;
  }

  if (!args.headerType.isTechnical && !args.cellType.isTechnical) {
    args.validPositions.push({
      headerText: args.headerType.text,
      cellIndex: args.index,
      cell: args.cell,
    });
    return;
  }

  const headerLabel = args.headerType.isTechnical ? 'tech' : args.headerType.text;
  args.logger.debug('Skipping technical table position', {
    index: args.index,
    header: headerLabel,
    cellType: args.cellType.type,
  });
}

function buildValidHeaderPositions(
  headerCells: Element[],
  bodyCells: Element[],
  logger: Pick<Logger, 'debug'>
): HeaderPosition[] {
  const cellTypes = bodyCells.map((cell, idx) => ({
    idx,
    ...isTechnicalCell(cell as HTMLElement),
  }));
  const headerTypes = headerCells.map((th, idx) => {
    const text = th.textContent?.trim() || '';
    const isTechnical = !text || /^[▾▲◇☰]$/.test(text);
    return { idx, text, isTechnical };
  });

  logHeaderMappingInputs({
    bodyCells,
    cellTypes,
    headerCells,
    headerTypes,
    logger,
  });

  const validPositions: HeaderPosition[] = [];
  const minLen = Math.min(headerCells.length, bodyCells.length);
  for (let i = 0; i < minLen; i += 1) {
    const headerType = headerTypes[i];
    const cellType = cellTypes[i];
    if (!headerType || !cellType) {
      continue;
    }

    appendValidHeaderPosition({
      cell: bodyCells[i],
      cellType,
      headerType,
      index: i,
      logger,
      validPositions,
    });
  }

  return validPositions;
}

export function buildHeaderToCellMapping(
  table: HTMLTableElement,
  rowElement: HTMLElement,
  logger: Pick<Logger, 'debug'>
): Map<string, TableTargetCell> {
  const mapping = new Map<string, TableTargetCell>();
  const headerCells = Array.from(table.querySelectorAll('thead th'));
  const bodyCells = Array.from(rowElement.querySelectorAll('td'));
  const validPositions = buildValidHeaderPositions(headerCells, bodyCells, logger);
  logger.debug('Valid header positions resolved', validPositions.length);

  validPositions.forEach(({ headerText, cellIndex, cell }) => {
    mapping.set(headerText, { cellIndex, cell });
    logger.debug('Mapped header to cell', { headerText, cellIndex });
  });

  return mapping;
}

export function findTargetCellByHeader(
  headerToCellMap: Map<string, TableTargetCell>,
  columnName: string,
  logger: Pick<Logger, 'debug'>
) {
  const targetCell = headerToCellMap.get(columnName)?.cell;
  if (targetCell) {
    return targetCell;
  }

  logger.debug('Exact column not found, trying partial match', columnName);
  for (const [headerName, cellInfo] of headerToCellMap) {
    if (headerName.includes(columnName) || columnName.includes(headerName)) {
      logger.debug('Found partial header match', { headerName, cellIndex: cellInfo.cellIndex });
      return cellInfo.cell;
    }
  }

  return null;
}

export function findTargetCellByNodeData(
  rowElement: HTMLElement,
  tableRow: TableRow,
  columnName: string,
  logger: Pick<Logger, 'debug'>
) {
  const headers = Object.keys(tableRow.data || {});
  const columnIndex = headers.indexOf(columnName);
  if (columnIndex === -1) {
    return null;
  }

  const cells = rowElement.querySelectorAll('td');
  let dataCellIndex = 0;
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    if (!(cell instanceof HTMLElement)) {
      continue;
    }

    const { isTechnical } = isTechnicalCell(cell);
    if (!isTechnical) {
      if (dataCellIndex === columnIndex) {
        logger.debug('Resolved target cell by node data index', i);
        return cell;
      }
      dataCellIndex += 1;
    }
  }

  return null;
}
