/**
 * Generic Key-Value Table Parser
 * Parses standard HTML tables with 2 columns (label | value)
 */

import type { FieldNode, TableNode, TableRow } from '@sniptale/runtime-contracts/dom-tree';
import { DOMParser, type TraversalContext, type ParserResult } from '../../types';
import { generateStableId, generateId } from '../../../dom-utils/id-generator';
import {
  extractCleanText,
  extractLinkText,
  getSelector,
  isElementVisible,
  setSniptaleId,
} from '../../../dom-utils/dom-helpers';
import {
  extractDataTableRows,
  extractTableHeaders,
  resolveTableHeaderRow,
} from './key-value.helpers';

/**
 * Checks if table is a key-value table (2 columns)
 */
function isKeyValueTable(table: HTMLTableElement): boolean {
  const rows = table.querySelectorAll('tr');
  let twoColumnRows = 0;
  let totalRows = 0;

  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length === 2) {
      twoColumnRows++;
    }
    if (cells.length > 0) {
      totalRows++;
    }
  });

  // If most rows have 2 columns, it's a key-value table
  return totalRows > 0 && twoColumnRows / totalRows >= 0.8;
}

/**
 * Checks if table is a data table (with headers)
 */
function isDataTable(table: HTMLTableElement): boolean {
  const thead = table.querySelector('thead');
  const headerRow = table.querySelector('tr:first-child');

  if (thead) {
    const ths = thead.querySelectorAll('th');
    return ths.length >= 2;
  }

  if (headerRow) {
    const ths = headerRow.querySelectorAll('th');
    return ths.length >= 2;
  }

  return false;
}

/**
 * Parses key-value table into fields
 */
function parseKeyValueRow(row: Element, ctx: TraversalContext): FieldNode | null {
  if (!isElementVisible(row as HTMLElement)) return null;

  const cells = row.querySelectorAll('td');
  if (cells.length !== 2) return null;

  const labelCell = cells[0];
  const valueCell = cells[1];
  if (!labelCell || !valueCell) {
    return null;
  }

  const label = extractCleanText(labelCell as HTMLElement).replace(/[:\s]+$/, '');
  let value = extractCleanText(valueCell as HTMLElement);
  let linkRef: string | undefined;
  let valueType: 'string' | 'link' | 'number' | 'boolean' = 'string';

  const link = valueCell.querySelector('a');
  if (link) {
    const linkData = extractLinkText(valueCell as HTMLElement);
    value = linkData.text || value;
    linkRef = linkData.href;
    valueType = 'link';
  }

  if (!label || !value) return null;
  if (label.toLowerCase() === value.toLowerCase()) return null;

  const stableId = generateStableId('field', valueCell as HTMLElement, ctx.globalFieldIndex);
  ctx.globalFieldIndex++;
  setSniptaleId(valueCell as HTMLElement, stableId);

  return {
    type: 'field',
    id: stableId,
    label,
    value,
    valueType,
    selector: getSelector(valueCell as HTMLElement),
    selected: true,
    ...(linkRef === undefined ? {} : { linkRef }),
  };
}

function parseKeyValueTable(table: HTMLTableElement, ctx: TraversalContext): FieldNode[] {
  const fields: FieldNode[] = [];
  const rows = table.querySelectorAll('tr');

  rows.forEach((row) => {
    const field = parseKeyValueRow(row, ctx);
    if (field) {
      fields.push(field);
    }
  });

  return fields;
}

/**
 * Parses data table into TableNode
 */
function parseDataTable(table: HTMLTableElement, ctx: TraversalContext): TableNode | null {
  let headers: string[] = [];
  const headerRow = resolveTableHeaderRow(table);
  if (!headerRow) return null;

  headers = extractTableHeaders(headerRow);
  if (headers.length === 0) return null;

  const rows: TableRow[] = extractDataTableRows({
    ctx,
    headerRow,
    headers,
    table,
  });
  if (rows.length === 0) return null;

  ctx.globalTableIndex++;

  return {
    type: 'table',
    id: generateId('table'),
    headers,
    rows,
    selected: false,
  };
}

/**
 * Generic Key-Value Table Parser
 * Handles standard HTML tables
 */
export class KeyValueTableParser extends DOMParser {
  name = 'KeyValueTable';
  priority = 15; // Low priority - fallback for non-GWT sites

  canParse(element: HTMLElement, ctx: TraversalContext): boolean {
    if (element.tagName.toLowerCase() !== 'table') return false;
    if (ctx.processedTables.has(element as HTMLTableElement)) return false;
    if (ctx.processedAttrLists.has(element as HTMLTableElement)) return false;

    // Skip GWT tables
    if (element.classList.contains('attrList') || element.classList.contains('cellTableWidget')) {
      return false;
    }

    return isKeyValueTable(element as HTMLTableElement) || isDataTable(element as HTMLTableElement);
  }

  parse(element: HTMLElement, ctx: TraversalContext): ParserResult {
    const table = element as HTMLTableElement;

    // Create section if none exists
    if (!ctx.currentSection) {
      const orphanSection = {
        type: 'section' as const,
        id: generateId('section'),
        title: 'Данные',
        children: [],
        selected: true,
      };
      ctx.result.structure.push(orphanSection);
      ctx.currentSection = orphanSection;
    }

    ctx.processedTables.add(table);

    // Try key-value first
    if (isKeyValueTable(table)) {
      const fields = parseKeyValueTable(table, ctx);
      if (fields.length > 0) {
        ctx.currentSection.children.push(...fields);
        return { fields };
      }
    }

    // Try data table
    const tableNode = parseDataTable(table, ctx);
    if (tableNode) {
      ctx.currentSection.children.push(tableNode);
      return { tables: [tableNode] };
    }

    return {};
  }
}
