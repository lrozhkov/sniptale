import type { Logger } from '@sniptale/platform/observability/logger/types';
import type { AIEditChange, ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { applyEditToElement } from '../element';
import { findFieldElementById } from '../../target-resolution';

export function applyFieldChange(
  tree: ParsedDOMTree,
  change: Extract<AIEditChange, { type: 'field' }>,
  logger: Pick<Logger, 'warn'>
) {
  const result = findFieldElementById(change.fieldId, tree);
  if (!result) {
    logger.warn('AI field target not found', change.fieldId);
    return false;
  }

  applyEditToElement(result.element, change.newValue, result.node);
  return true;
}
