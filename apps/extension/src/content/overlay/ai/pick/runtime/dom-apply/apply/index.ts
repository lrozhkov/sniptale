import { createLogger } from '@sniptale/platform/observability/logger';
import type { AIEditChange, ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { applyFieldChange } from './field-change';
import { applyTableRowChange } from './table-row-change';

const logger = createLogger({ namespace: 'ContentAiDomApply' });

export function applyAIChanges(
  tree: ParsedDOMTree,
  changes: AIEditChange[]
): { appliedCount: number; notFoundCount: number } {
  let appliedCount = 0;
  let notFoundCount = 0;

  logger.debug('Applying AI changes', { totalChanges: changes.length });

  for (const change of changes) {
    const applied =
      change.type === 'field'
        ? applyFieldChange(tree, change, logger)
        : applyTableRowChange(tree, change, logger);

    if (applied) {
      appliedCount += 1;
    } else {
      notFoundCount += 1;
    }
  }

  logger.debug('AI changes applied', { appliedCount, notFoundCount });

  return { appliedCount, notFoundCount };
}
