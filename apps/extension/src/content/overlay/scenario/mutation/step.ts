import {
  deleteScenarioStep,
  moveScenarioStep,
  restoreScenarioStep,
} from '../runtime/transport/steps';
import type { ScenarioControllerResponse } from '../types';

export async function applyScenarioDeleteRecentStep(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  projectId: string;
  stepId: string;
}) {
  const response = await deleteScenarioStep({
    projectId: args.projectId,
    stepId: args.stepId,
  });
  if (response?.success) {
    args.applyScenarioResponse(response);
  }
}

export async function applyScenarioMoveRecentStep(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  projectId: string;
  stepId: string;
  toIndex: number;
}) {
  const response = await moveScenarioStep({
    projectId: args.projectId,
    stepId: args.stepId,
    toIndex: args.toIndex,
  });
  if (response?.success) {
    args.applyScenarioResponse(response);
  }
}

export async function applyScenarioRestoreRecentStep(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  projectId: string;
  stepId: string;
}) {
  const response = await restoreScenarioStep({
    projectId: args.projectId,
    stepId: args.stepId,
  });
  if (response?.success) {
    args.applyScenarioResponse(response);
  }
}
