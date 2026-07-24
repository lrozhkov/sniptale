import { clearAllSniptaleIds } from '../../../../../platform/frame';
import { translate } from '../../../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { AIEditChange, ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { findAIChangeTargets } from '../../runtime/target-resolution/change-targets';
import { flashAppliedAiTargets } from '../../runtime/dom-apply/highlight';
import { parsePageSnapshotAfterIframePreflight } from '../../../../../parser/dom-tree-parser/snapshot';
import { applyAiChangesWithHistory } from './history';
import type { AiPickControllerContext } from '../types';

const logger = createLogger({ namespace: 'ContentAiPickSubmit' });

type AiPickApplyContext = Pick<
  AiPickControllerContext,
  'requestGate' | 'resumeAiPickMode' | 'setIsAIModalOpen' | 'setTreeData'
>;

function showAiParseErrors(errors: string[]) {
  if (errors.length === 0) {
    return;
  }

  showToast(`${translate('content.toolbar.aiParseErrorsPrefix')} ${errors.join('; ')}`, 'warning');
}

function showAiNoChangesInfo() {
  showToast(translate('content.toolbar.aiNoChanges'), 'info');
}

function showAiApplyToast(appliedCount: number, notFoundCount: number) {
  if (notFoundCount > 0) {
    showToast(
      [
        translate('content.toolbar.aiAppliedWithMissingPrefix'),
        appliedCount,
        translate('content.toolbar.aiAppliedWithMissingMiddle'),
        notFoundCount,
      ].join(''),
      'warning'
    );
    return;
  }

  showToast(
    [
      translate('content.toolbar.aiAppliedSuccessPrefix'),
      appliedCount,
      translate('content.toolbar.aiAppliedSuccessSuffix'),
    ].join(''),
    'success'
  );
}

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
  context: AiPickApplyContext,
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
