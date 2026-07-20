/**
 * GWT Table Parser
 * Parses table.cellTableWidget into table nodes
 */

import type { TableNode, TableRow } from '@sniptale/runtime-contracts/dom-tree';
import { createLogger } from '@sniptale/platform/observability/logger';
import { buildElementEvidence } from '../../ir/document-evidence';
import { DOMParser, type TraversalContext, type ParserResult } from '../types';
import { generateId } from '../../dom-utils/id-generator';
import { extractCleanText } from '../../dom-utils/dom-helpers';
import { extractTableHeaders, filterNonEmptyRows, parseGwtTableRows } from './table.helpers';

const logger = createLogger({ namespace: 'ContentGwtTableParser' });

/**
 * Parses cellTableWidget table
 */
function parseTable(tableElement: HTMLTableElement, ctx: TraversalContext): TableNode | null {
  const headerData = extractTableHeaders(tableElement);
  if (!headerData) return null;

  const rows: TableRow[] = parseGwtTableRows(
    tableElement,
    headerData.headers,
    headerData.headerIndices,
    headerData.totalHeaderCells
  );
  if (rows.length === 0) return null;

  const nonEmptyRows = filterNonEmptyRows(rows);
  if (nonEmptyRows.length === 0) {
    logger.log('Skipping empty table (all rows are empty)');
    return null;
  }

  ctx.globalTableIndex++;

  return {
    type: 'table',
    id: generateId('table'),
    headers: headerData.headers,
    rows: nonEmptyRows,
    selected: false,
    evidence: buildElementEvidence(tableElement),
  };
}

/**
 * GWT Table Parser
 * Handles table.cellTableWidget elements
 */
export class GWTTableParser extends DOMParser {
  name = 'GWTTable';
  priority = 80; // After attrList

  canParse(element: HTMLElement, ctx: TraversalContext): boolean {
    return (
      element.matches('table.cellTableWidget') &&
      !ctx.processedTables.has(element as HTMLTableElement)
    );
  }

  parse(element: HTMLElement, ctx: TraversalContext): ParserResult {
    return parseGwtTableElement(element as HTMLTableElement, ctx);
  }
}

export function parseGwtTableElement(
  element: HTMLTableElement,
  ctx: TraversalContext
): ParserResult {
  // Create section if none exists
  if (!ctx.currentSection) {
    let sectionTitle = 'Список';
    const parent = element.closest('.GAQEVERFM, [id*="RelObjectList"], [id*="PropertyList"]');
    if (parent) {
      const titleElement = parent.querySelector('[id*="title"], .GAQEVERAM');
      if (titleElement) {
        const titleText = extractCleanText(titleElement as HTMLElement);
        if (titleText) {
          sectionTitle = titleText;
        }
      }
    }

    const orphanSection = {
      type: 'section' as const,
      id: generateId('section'),
      title: sectionTitle,
      children: [],
      selected: true,
      kind: 'results' as const,
    };
    ctx.result.structure.push(orphanSection);
    ctx.currentSection = orphanSection;
  }

  const table = parseTable(element, ctx);
  if (table) {
    ctx.currentSection.children.push(table);
    ctx.processedTables.add(element);
    return { tables: [table] };
  }

  ctx.processedTables.add(element);
  return {};
}
