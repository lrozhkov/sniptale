import type { AIEditChange, ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { applyAIChanges } from '../../runtime/dom-apply/apply';
import { findAIChangeTargets } from '../../runtime/target-resolution/change-targets';
import {
  captureDomStateMap,
  createDomMutationBatch,
  pagePreparationHistory,
} from '../../../../../parser/page-preparation/history';

interface AiHistoryApplyResult {
  appliedCount: number;
  notFoundCount: number;
  targets: Element[];
}

export function applyAiChangesWithHistory(treeData: ParsedDOMTree, changes: AIEditChange[]) {
  const historyTransactionKey = `ai-apply:${Date.now()}`;
  const targets = findAIChangeTargets(treeData, changes);
  const beforeStates = captureDomStateMap(targets);

  pagePreparationHistory.beginTransaction(historyTransactionKey);
  try {
    const result = applyAIChanges(treeData, changes);
    pagePreparationHistory.commitTransaction(
      historyTransactionKey,
      createDomMutationBatch(targets, beforeStates)
    );

    return {
      ...result,
      targets,
    } satisfies AiHistoryApplyResult;
  } catch (error) {
    pagePreparationHistory.cancelTransaction(historyTransactionKey);
    throw error;
  }
}
