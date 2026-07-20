import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioV3ProjectHistory } from './types';

export function pushProjectHistory(
  history: ScenarioV3ProjectHistory,
  currentProject: ScenarioProjectV3,
  nextProject: ScenarioProjectV3
): ScenarioV3ProjectHistory {
  if (Object.is(currentProject, nextProject)) {
    return history;
  }

  return {
    future: [],
    past: [...history.past, currentProject],
  };
}

export function undoProjectHistory(args: {
  currentProject: ScenarioProjectV3;
  history: ScenarioV3ProjectHistory;
}): { history: ScenarioV3ProjectHistory; project: ScenarioProjectV3 } | null {
  const previous = args.history.past.at(-1);
  if (!previous) {
    return null;
  }

  return {
    history: {
      future: [args.currentProject, ...args.history.future],
      past: args.history.past.slice(0, -1),
    },
    project: previous,
  };
}

export function redoProjectHistory(args: {
  currentProject: ScenarioProjectV3;
  history: ScenarioV3ProjectHistory;
}): { history: ScenarioV3ProjectHistory; project: ScenarioProjectV3 } | null {
  const next = args.history.future[0];
  if (!next) {
    return null;
  }

  return {
    history: {
      future: args.history.future.slice(1),
      past: [...args.history.past, args.currentProject],
    },
    project: next,
  };
}
