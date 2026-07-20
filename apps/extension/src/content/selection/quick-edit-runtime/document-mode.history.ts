import { addEventListenerToAllWindowsDynamic } from '../../platform/frame';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  captureDomStateMap,
  createDomMutationBatch,
  pagePreparationHistory,
  type PageDomElementState,
} from '../../parser/page-preparation/history';
import {
  isIgnoredDocumentModeTarget,
  resolveDocumentModeEditRoot,
  type QuickEditDocumentModeEditTarget,
} from './document-mode.targets';

const DOCUMENT_MODE_HISTORY_KEY = 'quick-edit-document-mode';
const logger = createLogger({ namespace: 'ContentQuickEditDocumentModeHistory' });

interface DocumentModeHistoryState {
  beforeStates: Map<string, PageDomElementState>;
  capturedRoots: Set<HTMLElement>;
  cleanupListeners: (() => void) | null;
  dirtyRoots: Set<HTMLElement>;
  isActive: boolean;
}

interface QuickEditDocumentModeHistoryTracker {
  begin: () => void;
  cancel: () => void;
  commit: () => void;
  recordPotentialEditTarget: (target: QuickEditDocumentModeEditTarget) => void;
}

function createDocumentModeHistoryState(): DocumentModeHistoryState {
  return {
    beforeStates: new Map(),
    capturedRoots: new Set(),
    cleanupListeners: null,
    dirtyRoots: new Set(),
    isActive: false,
  };
}

function mergeBeforeStates(
  target: Map<string, PageDomElementState>,
  nextStates: Map<string, PageDomElementState>
): void {
  nextStates.forEach((state, locator) => {
    target.set(locator, state);
  });
}

function registerDocumentModeHistoryListeners(props: {
  onBeforeInput: (event: InputEvent) => void;
  onInput: (event: InputEvent) => void;
}): () => void {
  const cleanupBeforeInput = addEventListenerToAllWindowsDynamic<InputEvent>(
    'beforeinput',
    props.onBeforeInput,
    { capture: true }
  );
  const cleanupInput = addEventListenerToAllWindowsDynamic<InputEvent>('input', props.onInput, {
    capture: true,
  });

  return () => {
    cleanupBeforeInput();
    cleanupInput();
  };
}

function resetDocumentModeHistoryState(state: DocumentModeHistoryState): void {
  state.cleanupListeners?.();
  state.beforeStates.clear();
  state.capturedRoots.clear();
  state.dirtyRoots.clear();
  state.cleanupListeners = null;
  state.isActive = false;
}

function resolveConnectedDirtyRoots(state: DocumentModeHistoryState): HTMLElement[] {
  const roots: HTMLElement[] = [];

  state.dirtyRoots.forEach((root) => {
    if (root.isConnected && !isIgnoredDocumentModeTarget(root)) {
      roots.push(root);
      return;
    }

    logger.warn('Skipped disconnected document-mode edit root during history commit', {
      tagName: root.tagName,
    });
  });

  return roots;
}

export function createQuickEditDocumentModeHistoryTracker(): QuickEditDocumentModeHistoryTracker {
  const state = createDocumentModeHistoryState();

  return {
    begin: () => beginDocumentModeHistory(state),
    cancel: () => cancelDocumentModeHistory(state),
    commit: () => commitDocumentModeHistory(state),
    recordPotentialEditTarget: (target) => recordPotentialEditTarget(state, target),
  };
}

function captureBeforeState(state: DocumentModeHistoryState, root: HTMLElement): void {
  if (state.capturedRoots.has(root)) {
    return;
  }

  mergeBeforeStates(state.beforeStates, captureDomStateMap([root]));
  state.capturedRoots.add(root);
}

function recordPotentialEditTarget(
  state: DocumentModeHistoryState,
  target: QuickEditDocumentModeEditTarget
): void {
  if (!state.isActive) {
    return;
  }

  const root = resolveDocumentModeEditRoot(target);
  if (root) {
    captureBeforeState(state, root);
  }
}

function markDirtyTarget(
  state: DocumentModeHistoryState,
  target: QuickEditDocumentModeEditTarget
): void {
  const root = resolveDocumentModeEditRoot(target);
  if (!state.isActive || !root) {
    return;
  }

  captureBeforeState(state, root);
  state.dirtyRoots.add(root);
}

function beginDocumentModeHistory(state: DocumentModeHistoryState): void {
  if (state.isActive) {
    return;
  }

  state.isActive = true;
  pagePreparationHistory.beginTransaction(DOCUMENT_MODE_HISTORY_KEY);
  state.cleanupListeners = registerDocumentModeHistoryListeners({
    onBeforeInput: (event) => recordPotentialEditTarget(state, event.target),
    onInput: (event) => markDirtyTarget(state, event.target),
  });
}

function cancelDocumentModeHistory(state: DocumentModeHistoryState): void {
  if (!state.isActive) {
    return;
  }

  pagePreparationHistory.cancelTransaction(DOCUMENT_MODE_HISTORY_KEY);
  resetDocumentModeHistoryState(state);
}

function commitDocumentModeHistory(state: DocumentModeHistoryState): void {
  if (!state.isActive) {
    return;
  }

  const changedRoots = resolveConnectedDirtyRoots(state);
  if (changedRoots.length === 0) {
    cancelDocumentModeHistory(state);
    return;
  }

  try {
    commitChangedRoots(state, changedRoots);
  } catch (error) {
    logger.error('Failed to commit document-mode history transaction', error);
    cancelDocumentModeHistory(state);
  }
}

function commitChangedRoots(state: DocumentModeHistoryState, changedRoots: HTMLElement[]): void {
  pagePreparationHistory.commitTransaction(
    DOCUMENT_MODE_HISTORY_KEY,
    createDomMutationBatch(changedRoots, state.beforeStates)
  );
  resetDocumentModeHistoryState(state);
}
