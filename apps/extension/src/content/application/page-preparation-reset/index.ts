import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'ContentPagePreparationReset' });
const MAX_UNDO_STEPS = 10_000;

type PagePreparationResetHistory = {
  clear(): void;
  getState(): { canUndo: boolean; revision: number };
  undo(): void;
};

type PagePreparationResetDependencies = {
  clearHighlights: () => void;
  history: PagePreparationResetHistory;
  resetAnnotations: () => void;
};

export function clearAllPagePreparationChanges(
  dependencies: PagePreparationResetDependencies
): boolean {
  let undoSteps = 0;
  let previousState = dependencies.history.getState();

  while (previousState.canUndo && undoSteps < MAX_UNDO_STEPS) {
    dependencies.history.undo();
    undoSteps += 1;
    const nextState = dependencies.history.getState();
    if (nextState.canUndo && nextState.revision === previousState.revision) {
      logger.warn('Stopped page preparation reset because history made no progress');
      break;
    }
    previousState = nextState;
  }

  const fullyReverted = !dependencies.history.getState().canUndo;
  if (!fullyReverted) {
    logger.warn('Page preparation reset could not finish undoing changes', { undoSteps });
    return false;
  }
  dependencies.clearHighlights();
  dependencies.resetAnnotations();
  dependencies.history.clear();
  return true;
}
