import type { EditableElement } from '../../../features/highlighter/contracts';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  createQuickEditDocumentModeHistoryTracker,
  QuickEditDocumentModeRecoveryPendingError,
} from './document-mode.history';
import {
  QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS,
  QUICK_EDIT_TEXT_CURSOR_BODY_CLASS,
} from './style.constants';

const ENABLED_DESIGN_MODE = 'on';

const logger = createLogger({ namespace: 'ContentQuickEditDocumentMode' });

interface QuickEditDocumentModeProps {
  disableRequested: () => void;
  editingElements: Map<string, EditableElement>;
  finishEditing: (element: HTMLElement) => void;
  getIsQuickEditMode: () => boolean;
  hideBlockingOverlay: () => void;
  hideHoverOverlay: () => void;
}

interface QuickEditDocumentModeState {
  previousDesignMode: string | null;
}

function readDesignMode(): string {
  return document.designMode || 'off';
}

function isDesignModeEnabled(): boolean {
  return readDesignMode().toLowerCase() === ENABLED_DESIGN_MODE;
}

function finishTargetedEditing(props: QuickEditDocumentModeProps): void {
  Array.from(props.editingElements.values()).forEach((editable) => {
    props.finishEditing(editable.element);
  });
}

export function createQuickEditDocumentMode(props: QuickEditDocumentModeProps) {
  const state: QuickEditDocumentModeState = {
    previousDesignMode: null,
  };
  const historyTracker = createQuickEditDocumentModeHistoryTracker({
    onCaptureFailure: (error) => handleDocumentModeCaptureFailure(props, state, error),
    onRecoveryFailure: (error) => handleDocumentModeRecoveryFailure(props, state, error),
  });

  function isEnabled(): boolean {
    return isDocumentModeOwnerEnabled(state);
  }

  return {
    disable: () => disableDocumentMode(state, historyTracker),
    enable: () => enableDocumentMode(props, state, historyTracker),
    isEnabled,
  };
}

function isDocumentModeOwnerEnabled(state: QuickEditDocumentModeState): boolean {
  return state.previousDesignMode !== null;
}

function cleanupDocumentModeState(state: QuickEditDocumentModeState): void {
  document.body?.classList.remove(QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS);
  document.body?.classList.remove(QUICK_EDIT_TEXT_CURSOR_BODY_CLASS);
  state.previousDesignMode = null;
}

function requestDisableAfterDocumentModeFailure(props: QuickEditDocumentModeProps): void {
  try {
    props.disableRequested();
  } catch (error) {
    logger.error('Failed to request Quick Edit disable after document-mode failure', error);
  }
}

function handleDocumentModeCaptureFailure(
  props: QuickEditDocumentModeProps,
  state: QuickEditDocumentModeState,
  error: Error
): boolean {
  const designModeToRestore = state.previousDesignMode;
  if (designModeToRestore === null) {
    logger.error('Document-mode capture failed before activation', error);
    requestDisableAfterDocumentModeFailure(props);
    return true;
  }

  try {
    document.designMode = designModeToRestore;
  } catch (restoreError) {
    logger.error('Failed to restore document mode after capture failure', restoreError);
    requestDisableAfterDocumentModeFailure(props);
    return false;
  }

  cleanupDocumentModeState(state);
  logger.error('Document mode disabled after history capture failure', error);
  requestDisableAfterDocumentModeFailure(props);
  return true;
}

function handleDocumentModeRecoveryFailure(
  props: QuickEditDocumentModeProps,
  state: QuickEditDocumentModeState,
  error: Error
): void {
  const designModeToRestore = state.previousDesignMode;
  if (designModeToRestore !== null) {
    try {
      document.designMode = designModeToRestore;
    } catch (restoreError) {
      logger.error('Failed to restore document mode after input recovery failure', restoreError);
    }
  }

  logger.error('Document mode input recovery remains pending', error);
  requestDisableAfterDocumentModeFailure(props);
}

function enableDocumentMode(
  props: QuickEditDocumentModeProps,
  state: QuickEditDocumentModeState,
  historyTracker: ReturnType<typeof createQuickEditDocumentModeHistoryTracker>
): void {
  if (isDocumentModeOwnerEnabled(state)) {
    logger.debug('Quick edit document mode already enabled');
    return;
  }

  if (!props.getIsQuickEditMode()) {
    logger.warn('Quick edit document mode requires quick edit mode');
    return;
  }

  finishTargetedEditing(props);
  props.hideHoverOverlay();
  props.hideBlockingOverlay();
  historyTracker.begin();
  try {
    applyDocumentModeEnable(state, readDesignMode());
  } catch (error) {
    historyTracker.cancel();
    throw error;
  }
}

function applyDocumentModeEnable(state: QuickEditDocumentModeState, originalDesignMode: string) {
  try {
    state.previousDesignMode = originalDesignMode;
    document.designMode = ENABLED_DESIGN_MODE;
    if (!isDesignModeEnabled()) {
      throw new Error('document.designMode did not switch to "on"');
    }
    document.body?.classList.remove(QUICK_EDIT_TEXT_CURSOR_BODY_CLASS);
    document.body?.classList.add(QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS);
    logger.log('Quick edit document mode enabled');
  } catch (error) {
    try {
      document.designMode = originalDesignMode;
    } finally {
      cleanupDocumentModeState(state);
    }
    logger.error('Failed to enable quick edit document mode', error);
    throw error;
  }
}

function disableDocumentMode(
  state: QuickEditDocumentModeState,
  historyTracker: ReturnType<typeof createQuickEditDocumentModeHistoryTracker>
): void {
  const designModeToRestore = state.previousDesignMode;
  if (designModeToRestore === null) {
    return;
  }

  try {
    document.designMode = designModeToRestore;
  } catch (error) {
    logger.error('Failed to disable quick edit document mode', error);
    throw error;
  }

  try {
    historyTracker.commit();
  } catch (error) {
    if (!(error instanceof QuickEditDocumentModeRecoveryPendingError)) {
      cleanupDocumentModeState(state);
    }
    throw error;
  }
  cleanupDocumentModeState(state);
  logger.log('Quick edit document mode disabled');
}
