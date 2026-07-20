import type { Dispatch, SetStateAction } from 'react';

import { cloneHistorySnapshot } from '@sniptale/foundation/history/clone';
import type {
  ScenarioCaptureStep,
  ScenarioProject,
} from '../../../../../features/scenario/contracts/types/project';

export type ScenarioProjectHistorySnapshot = {
  project: ScenarioProject;
  quickEditStepId: string | null;
  selectedStepId: string | null;
};

export type ScenarioProjectHistoryState = {
  future: ScenarioProjectHistorySnapshot[];
  past: ScenarioProjectHistorySnapshot[];
};

export function buildProjectHistorySnapshot(args: {
  project: ScenarioProject;
  quickEditStepId: string | null;
  selectedStepId: string | null;
}): ScenarioProjectHistorySnapshot {
  return {
    project: cloneHistorySnapshot(args.project),
    quickEditStepId: args.quickEditStepId,
    selectedStepId: args.selectedStepId,
  };
}

function resolveSelectedStepId(project: ScenarioProject, stepId: string | null) {
  if (stepId && project.steps.some((step) => step.id === stepId)) {
    return stepId;
  }

  return project.steps[0]?.id ?? null;
}

function resolveQuickEditStepId(project: ScenarioProject, stepId: string | null) {
  if (!stepId) {
    return null;
  }

  const quickEditStep = project.steps.find(
    (step): step is ScenarioCaptureStep => step.id === stepId && step.kind === 'capture'
  );
  return quickEditStep?.id ?? null;
}

export function applyProjectHistorySnapshot(args: {
  setProject: Dispatch<SetStateAction<ScenarioProject | null>>;
  setQuickEditStepId: Dispatch<SetStateAction<string | null>>;
  setSelectedStepId: Dispatch<SetStateAction<string | null>>;
  snapshot: ScenarioProjectHistorySnapshot;
}) {
  const projectSnapshot = cloneHistorySnapshot(args.snapshot.project);
  args.setProject(projectSnapshot);
  args.setSelectedStepId(resolveSelectedStepId(projectSnapshot, args.snapshot.selectedStepId));
  args.setQuickEditStepId(resolveQuickEditStepId(projectSnapshot, args.snapshot.quickEditStepId));
}
