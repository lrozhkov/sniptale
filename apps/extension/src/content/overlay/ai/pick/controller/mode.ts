import { translate } from '../../../../../platform/i18n';
import { clearAllSniptaleIds } from '../../../../platform/frame';
import { createLogger } from '@sniptale/platform/observability/logger';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { markSelectedInTree } from '../runtime/dom-apply';
import {
  disableAiPickModeIfLoaded,
  enableAiPickModeDeferred,
  preloadAiPickRuntime,
} from '../runtime/lazy';
import { disableHighlighterMode } from '../../../../selection/highlighter';
import {
  disableQuickEditDocumentMode,
  disableQuickEditMode,
} from '../../../../selection/quick-edit';
import { preloadAiPickSubmit } from './submit/lazy';
import type { AiPickControllerContext } from './types';

const logger = createLogger({ namespace: 'ContentAiPick' });

function warmAIModal(context: Pick<AiPickControllerContext, 'preloadAIModal'>): void {
  context.preloadAIModal().catch((error) => {
    logger.warn('Failed to preload AI modal chunk', error);
  });
}

function warmAiPickRuntime(): void {
  preloadAiPickRuntime().catch((error) => {
    logger.warn('Failed to preload AI pick runtime chunk', error);
  });
}

function warmAiPickSubmit(): void {
  preloadAiPickSubmit().catch((error) => {
    logger.warn('Failed to preload AI submit chunk', error);
  });
}

function resumeAiPickSelectionRuntime(context: AiPickControllerContext) {
  const enableEpoch = context.beginAiPickEnableSession();
  const handleSelected = (
    tree: Parameters<typeof markSelectedInTree>[0],
    selectedIds: Set<string>
  ) => {
    if (!context.isCurrentAiPickEnableSession(enableEpoch)) {
      return;
    }

    logger.log('AI pick selected ids', selectedIds.size);
    const markedTree = markSelectedInTree(tree, selectedIds);
    disableAiPickModeIfLoaded();
    context.setTreeData(markedTree);
    warmAiPickSubmit();
    context.setIsAIModalOpen(true);
  };
  const enablePromise = context.aiPickSource
    ? enableAiPickModeDeferred(handleSelected, { source: context.aiPickSource })
    : enableAiPickModeDeferred(handleSelected);

  return enablePromise.catch((error) => {
    if (!context.isCurrentAiPickEnableSession(enableEpoch)) {
      return;
    }

    logger.error('Failed to enable AI pick mode', error);
    context.invalidateAiPickEnableSession();
    context.setAiPickMode(false);
    showToast(translate('content.toolbar.aiNoData'), 'error');
  });
}

export function handleDisableAiPickMode(context: AiPickControllerContext) {
  if (context.aiPickMode) {
    context.invalidateAiPickEnableSession();
    clearAllSniptaleIds();
    context.cancelActiveAiRequest();
    context.setIsAILoading(false);
    context.setIsAIModalOpen(false);
    context.setTreeData(null);
    context.setAiPickMode(false);
    disableAiPickModeIfLoaded();
  }
}

export function handleAiPickContentStart(context: AiPickControllerContext) {
  if (context.aiPickMode) {
    handleDisableAiPickMode(context);
    return;
  }

  warmAIModal(context);
  warmAiPickRuntime();
  disableHighlighterMode();
  context.setHighlighterMode(false);
  disableQuickEditDocumentMode();
  disableQuickEditMode();
  context.setQuickEditDocumentMode(false);
  context.setQuickEditMode(false);
  context.setAiPickMode(true);
  logger.log('Disabled highlighter and quick edit modes before enabling AI');

  void resumeAiPickSelectionRuntime(context);
}

export function handleResumeAiPickMode(context: AiPickControllerContext) {
  if (!context.aiPickMode) {
    return;
  }

  void resumeAiPickSelectionRuntime(context);
}
