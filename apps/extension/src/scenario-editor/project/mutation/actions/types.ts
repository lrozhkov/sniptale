import type { ScenarioProject } from '../../../../features/scenario/contracts/types/project';

export type UpdateProject = (updater: (current: ScenarioProject) => ScenarioProject) => void;

export interface ScenarioProjectSelectionActionArgs {
  getCurrentProject: () => ScenarioProject | null;
  setError: (message: string | null) => void;
  setSelectedStepId: (stepId: string | null) => void;
  updateProject: UpdateProject;
}
