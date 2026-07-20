import type { Logger } from '@sniptale/platform/observability/logger/types';
import type { AIEditChange, ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { applyTableEdit } from '../table';
import { findTableRowElementById } from '../../target-resolution';
import { updateTextPreservingStructure } from '../structure';

export function applyTableRowChange(
  tree: ParsedDOMTree,
  change: Extract<AIEditChange, { type: 'tableRow' }>,
  logger: Pick<Logger, 'warn'>
) {
  const result = findTableRowElementById(change.rowId, tree);
  if (!result) {
    logger.warn('AI table row target not found', change.rowId);
    return false;
  }

  return Object.entries(change.columnEdits).every(([columnName, newValue]) =>
    applyTableEdit(result.element, columnName, newValue, result.node, updateTextPreservingStructure)
  );
}
