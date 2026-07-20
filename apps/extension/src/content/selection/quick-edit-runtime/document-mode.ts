import type { EditableElement } from '../../../features/highlighter/contracts';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createQuickEditDocumentModeHistoryTracker } from './document-mode.history';

const DOCUMENT_MODE_BODY_CLASS = 'sniptale-quick-edit-document-mode';
const ENABLED_DESIGN_MODE = 'on';

const logger = createLogger({ namespace: 'ContentQuickEditDocumentMode' });

interface QuickEditDocumentModeProps {
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
  const historyTracker = createQuickEditDocumentModeHistoryTracker();

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
  document.body?.classList.remove(DOCUMENT_MODE_BODY_CLASS);
  state.previousDesignMode = null;
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
    document.body?.classList.add(DOCUMENT_MODE_BODY_CLASS);
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

  historyTracker.commit();
  cleanupDocumentModeState(state);
  logger.log('Quick edit document mode disabled');
}
