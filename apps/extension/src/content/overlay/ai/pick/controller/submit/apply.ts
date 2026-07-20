import { clearAllSniptaleIds } from '../../../../../platform/frame';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { AIEditChange, ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { findAIChangeTargets } from '../../runtime/dom-apply';
import { flashAppliedAiTargets } from '../../runtime/dom-apply/highlight';
import { parsePageSnapshotAfterIframePreflight } from '../../../../../parser/dom-tree-parser/snapshot';
import { showAiApplyToast, showAiNoChangesInfo, showAiParseErrors } from './feedback';
import { applyAiChangesWithHistory } from './history';
import type { AiPickSubmitContext } from './types';

const logger = createLogger({ namespace: 'ContentAiPickSubmit' });

function collectConnectedTargets(targets: Element[]) {
  return targets.filter((target, index, allTargets) => {
    return target.isConnected && allTargets.indexOf(target) === index;
  });
}

async function resolveAppliedHighlightTargets(args: {
  changes: AIEditChange[];
  historyTargets: Element[];
  treeData: ParsedDOMTree;
}) {
  const connectedTargets = collectConnectedTargets(args.historyTargets);
  const currentTargets = collectConnectedTargets([
    ...connectedTargets,
    ...findAIChangeTargets(args.treeData, args.changes),
  ]);
  logger.debug('AI pick resolve highlight targets', {
    changeCount: args.changes.length,
    connectedHistoryTargetsCount: connectedTargets.length,
    currentTargetsCount: currentTargets.length,
  });
  if (currentTargets.length > 0) {
    return currentTargets;
  }

  const refreshedTree = await parsePageSnapshotAfterIframePreflight('ai-pick-apply-highlight');
  const refreshedTargets = collectConnectedTargets([
    ...currentTargets,
    ...findAIChangeTargets(refreshedTree, args.changes),
  ]);
  logger.debug('AI pick refreshed highlight targets', {
    refreshedTargetsCount: refreshedTargets.length,
  });
  return refreshedTargets;
}

export async function applyAiResponseChanges(
  parsedResponse: { changes: AIEditChange[]; errors: string[] },
  treeData: ParsedDOMTree,
  context: AiPickSubmitContext,
  requestId: number
) {
  const { changes, errors } = parsedResponse;
  logger.debug('Parsed AI response', {
    changeCount: changes.length,
    parseErrorCount: errors.length,
  });

  if (errors.length > 0) {
    logger.warn('AI response contains parse errors', {
      parseErrorCount: errors.length,
    });
    showAiParseErrors(errors);
  }
  if (changes.length === 0) {
    showAiNoChangesInfo();
    return;
  }

  const { appliedCount, notFoundCount, targets } = applyAiChangesWithHistory(treeData, changes);
  logger.debug('AI pick apply history result', {
    appliedCount,
    historyTargetsCount: targets.length,
    notFoundCount,
  });
  const highlightTargets = await resolveAppliedHighlightTargets({
    changes,
    historyTargets: targets,
    treeData,
  });
  if (!context.requestGate.isCurrent(requestId)) {
    logger.debug('AI pick apply aborted after stale highlight resolution', {
      requestId,
    });
    return;
  }
  logger.debug('AI pick final highlight targets', {
    highlightTargetsCount: highlightTargets.length,
  });
  clearAllSniptaleIds();
  context.setIsAIModalOpen(false);
  context.setTreeData(null);
  flashAppliedAiTargets(highlightTargets);
  context.resumeAiPickMode?.();
  showAiApplyToast(appliedCount, notFoundCount);
}
