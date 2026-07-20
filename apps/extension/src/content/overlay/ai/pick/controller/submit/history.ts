import type { AIEditChange, ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { applyAIChanges, findAIChangeTargets } from '../../runtime/dom-apply';
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
  const result = applyAIChanges(treeData, changes);
  pagePreparationHistory.commitTransaction(
    historyTransactionKey,
    createDomMutationBatch(targets, beforeStates)
  );

  return {
    ...result,
    targets,
  } satisfies AiHistoryApplyResult;
}
