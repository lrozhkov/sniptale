import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'ContentPagePreparationReset' });
const MAX_UNDO_STEPS = 10_000;

type PagePreparationResetHistory = {
  clear(): void;
  getState(): { canUndo: boolean; revision: number };
  hasOpenTransactions(): boolean;
  undo(): void;
};

type PagePreparationResetDependencies = {
  clearHighlights: () => void;
  history: PagePreparationResetHistory;
  resetAnnotations: () => void;
};

/** Reverts recorded changes without discarding redo or residual owner evidence. */
export function restorePagePreparationHistory(history: PagePreparationResetHistory): boolean {
  if (history.hasOpenTransactions()) {
    logger.warn('Stopped page preparation reset while an editor transaction is open');
    return false;
  }
  let undoSteps = 0;
  let previousState = history.getState();

  while (previousState.canUndo && undoSteps < MAX_UNDO_STEPS) {
    history.undo();
    undoSteps += 1;
    const nextState = history.getState();
    if (nextState.canUndo && nextState.revision === previousState.revision) {
      logger.warn('Stopped page preparation reset because history made no progress');
      break;
    }
    previousState = nextState;
  }

  const fullyReverted = !history.getState().canUndo && !history.hasOpenTransactions();
  if (!fullyReverted) {
    logger.warn('Page preparation reset could not finish undoing changes', { undoSteps });
    return false;
  }
  return true;
}

export function clearAllPagePreparationChanges(
  dependencies: PagePreparationResetDependencies
): boolean {
  if (!restorePagePreparationHistory(dependencies.history)) return false;
  dependencies.clearHighlights();
  dependencies.resetAnnotations();
  dependencies.history.clear();
  return true;
}
