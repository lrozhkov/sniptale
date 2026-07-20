import type { ScenarioStep } from '../../../../../features/scenario/contracts/types/project';
import { cloneHistorySnapshot } from '@sniptale/foundation/history/clone';

const MAX_SCENARIO_STEP_HISTORY_ENTRIES = 40;

interface ScenarioStepHistoryEntry {
  future: ScenarioStep[];
  past: ScenarioStep[];
}

export type ScenarioStepHistoryState = Record<string, ScenarioStepHistoryEntry>;

function getStepHistoryEntry(
  historyState: ScenarioStepHistoryState,
  stepId: string
): ScenarioStepHistoryEntry {
  return historyState[stepId] ?? { future: [], past: [] };
}

export function pushScenarioStepHistory(
  historyState: ScenarioStepHistoryState,
  step: ScenarioStep
): ScenarioStepHistoryState {
  const entry = getStepHistoryEntry(historyState, step.id);

  return {
    ...historyState,
    [step.id]: {
      future: [],
      past: [...entry.past, cloneHistorySnapshot(step)].slice(-MAX_SCENARIO_STEP_HISTORY_ENTRIES),
    },
  };
}

export function pruneScenarioStepHistory(
  historyState: ScenarioStepHistoryState,
  stepIds: string[]
): ScenarioStepHistoryState {
  const allowedStepIds = new Set(stepIds);

  return Object.fromEntries(
    Object.entries(historyState).filter(([stepId]) => allowedStepIds.has(stepId))
  );
}

export function canUndoScenarioStep(
  historyState: ScenarioStepHistoryState,
  stepId: string
): boolean {
  return getStepHistoryEntry(historyState, stepId).past.length > 0;
}

export function canRedoScenarioStep(
  historyState: ScenarioStepHistoryState,
  stepId: string
): boolean {
  return getStepHistoryEntry(historyState, stepId).future.length > 0;
}

export function consumeScenarioStepUndo(args: {
  currentStep: ScenarioStep;
  historyState: ScenarioStepHistoryState;
}): { historyState: ScenarioStepHistoryState; restoredStep: ScenarioStep | null } {
  const entry = getStepHistoryEntry(args.historyState, args.currentStep.id);
  const restoredStep = entry.past.at(-1) ?? null;

  if (!restoredStep) {
    return { historyState: args.historyState, restoredStep: null };
  }

  return {
    historyState: {
      ...args.historyState,
      [args.currentStep.id]: {
        future: [...entry.future, cloneHistorySnapshot(args.currentStep)].slice(
          -MAX_SCENARIO_STEP_HISTORY_ENTRIES
        ),
        past: entry.past.slice(0, -1),
      },
    },
    restoredStep: cloneHistorySnapshot(restoredStep),
  };
}

export function consumeScenarioStepRedo(args: {
  currentStep: ScenarioStep;
  historyState: ScenarioStepHistoryState;
}): { historyState: ScenarioStepHistoryState; restoredStep: ScenarioStep | null } {
  const entry = getStepHistoryEntry(args.historyState, args.currentStep.id);
  const restoredStep = entry.future.at(-1) ?? null;

  if (!restoredStep) {
    return { historyState: args.historyState, restoredStep: null };
  }

  return {
    historyState: {
      ...args.historyState,
      [args.currentStep.id]: {
        future: entry.future.slice(0, -1),
        past: [...entry.past, cloneHistorySnapshot(args.currentStep)].slice(
          -MAX_SCENARIO_STEP_HISTORY_ENTRIES
        ),
      },
    },
    restoredStep: cloneHistorySnapshot(restoredStep),
  };
}
