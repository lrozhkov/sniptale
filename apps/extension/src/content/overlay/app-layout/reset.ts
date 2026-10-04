import { flushSync } from 'react-dom';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { createLogger } from '@sniptale/platform/observability/logger';
import { clearAllPagePreparationChanges } from '../../application/page-preparation-reset';
import {
  pagePreparationHistory,
  type PagePreparationResetScope,
} from '../../parser/page-preparation/history';
import { browserAnnotationSession } from '../../parser/page-preparation/annotations';
import { clearAllHighlights, clearFrameEditing } from '../../selection/highlighter';
import { useFrameUIStore } from '../../selection/frame-runtime/state/frame-ui.store';
import {
  hasPendingQuickEditDocumentModeChanges,
  hasPendingQuickEditElementChanges,
  finalizeQuickEditElementChanges,
  isQuickEditDocumentModeEnabled,
  subscribeToQuickEditChanges,
} from '../../selection/quick-edit';
import { translate } from '../../../platform/i18n';
import { flushPendingPageStyleHistory } from '../design-review/runtime/actions';
import {
  finalizeDesignReviewCommentDraft,
  hasPendingDesignReviewCommentDraft,
  subscribeToDesignReviewCommentDraft,
} from '../design-review/session/comment-draft-finalization';
import { finalizeInteractiveFrameEditsForReset } from '../../selection/interactive-frame/controller/reset-finalization';
import type { ContentAppLayoutToolbarProps } from './types';
import type { ContentDrawingController } from '../../drawing/controller';

const logger = createLogger({ namespace: 'ContentPagePreparationReset' });

export function subscribeResetAvailability(
  listener: () => void,
  drawingController?: ContentDrawingController
): () => void {
  const unsubscribeHistory = pagePreparationHistory.subscribe(listener);
  const unsubscribeAnnotations = browserAnnotationSession.subscribe(listener);
  const unsubscribeDocumentMode = subscribeToQuickEditChanges(listener);
  const unsubscribeDrawing = drawingController?.subscribePendingTextChange?.(listener);
  const unsubscribeComment = subscribeToDesignReviewCommentDraft(listener);
  return () => {
    unsubscribeHistory();
    unsubscribeAnnotations();
    unsubscribeDocumentMode();
    unsubscribeDrawing?.();
    unsubscribeComment();
  };
}

export function getPagePreparationResetScope(
  modes: ContentAppLayoutToolbarProps['modes']
): PagePreparationResetScope {
  if (modes.drawingMode) return 'drawing';
  if (modes.designReviewMode) return 'design-review';
  if (modes.highlighterMode) return 'annotation';
  if (modes.quickEditMode || modes.quickEditDocumentMode || modes.aiPickMode)
    return 'content-editing';
  return 'all';
}

export function canResetPagePreparation(
  drawingController?: ContentDrawingController,
  scope: PagePreparationResetScope = 'all'
): boolean {
  const includes = (owner: PagePreparationResetScope) => scope === 'all' || scope === owner;
  return (
    (scope === 'all'
      ? pagePreparationHistory.getState().canUndo
      : pagePreparationHistory.hasChanges(scope)) ||
    pagePreparationHistory.hasPendingSnapshotChanges(scope === 'all' ? undefined : scope) ||
    (includes('content-editing') &&
      (hasPendingQuickEditDocumentModeChanges() || hasPendingQuickEditElementChanges())) ||
    (includes('drawing') && drawingController?.hasPendingTextChange?.() === true) ||
    (includes('design-review') && hasPendingDesignReviewCommentDraft())
  );
}

function finalizePendingChanges(toolbar: ContentAppLayoutToolbarProps): void {
  toolbar.drawingController?.finalizeInteraction();
  if (toolbar.drawingController?.hasPendingTextChange?.()) {
    throw new Error('Drawing text could not finish');
  }
  finalizeDesignReviewCommentDraft();
  if (hasPendingDesignReviewCommentDraft())
    throw new Error('Design Review comment could not finish');
  if (isQuickEditDocumentModeEnabled()) {
    toolbar.modeController.handleToggleQuickEditDocumentMode(false);
    if (isQuickEditDocumentModeEnabled()) throw new Error('Page Edit could not finish');
  }
  finalizeQuickEditElementChanges();
  if (hasPendingQuickEditElementChanges()) throw new Error('Inline Page Edit could not finish');
  flushPendingPageStyleHistory();
  flushSync(() => {
    finalizeInteractiveFrameEditsForReset();
    useFrameUIStore.getState().closePopover();
    clearFrameEditing();
  });
  pagePreparationHistory.flushDeferredCommits();
}

export function clearPagePreparation(toolbar: ContentAppLayoutToolbarProps): void {
  try {
    finalizePendingChanges(toolbar);
  } catch (error) {
    logger.error('Failed to finalize page changes before reset', error);
    showToast(translate('content.toolbar.someChangesCouldNotBeCleared'), 'error');
    return;
  }
  const scope = getPagePreparationResetScope(toolbar.modes);
  const fullyCleared =
    scope === 'all'
      ? clearAllPagePreparationChanges({
          clearHighlights: clearAllHighlights,
          history: pagePreparationHistory,
          resetAnnotations: browserAnnotationSession.resetForDocument,
        })
      : pagePreparationHistory.resetScope(scope);
  const successMessage =
    scope === 'all' ? 'content.toolbar.allChangesCleared' : 'content.toolbar.modeChangesCleared';
  showToast(
    translate(fullyCleared ? successMessage : 'content.toolbar.someChangesCouldNotBeCleared'),
    fullyCleared ? 'info' : 'error'
  );
}
