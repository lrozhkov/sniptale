import type {
  ScenarioProjectSummary,
  ScenarioRecentStep,
  ScenarioTrashedStep,
} from '../../../../features/scenario/contracts/types/project';
import type { ScenarioControllerResponse } from '../types';

export type ScenarioCollectionsApplierArgs = {
  hasLoadedStepsRef: { current: boolean };
  prevIdsRef: { current: string[] };
  setHighlightToken: React.Dispatch<React.SetStateAction<number>>;
  setProjects: React.Dispatch<React.SetStateAction<ScenarioProjectSummary[]>>;
  setRecentSteps: React.Dispatch<React.SetStateAction<ScenarioRecentStep[]>>;
  setTrashedSteps: React.Dispatch<React.SetStateAction<ScenarioTrashedStep[]>>;
};

export function createScenarioCollectionsApplier(args: ScenarioCollectionsApplierArgs) {
  return (response: ScenarioControllerResponse) => {
    if (response.projects) {
      args.setProjects(response.projects);
    }
    if (response.recentSteps) {
      const latestRecentStepId = response.recentSteps[0]?.id ?? null;
      const prevIds = args.prevIdsRef.current;
      if (
        latestRecentStepId &&
        args.hasLoadedStepsRef.current &&
        !prevIds.includes(latestRecentStepId)
      ) {
        args.setHighlightToken((current) => current + 1);
      }
      args.hasLoadedStepsRef.current = true;
      args.prevIdsRef.current = response.recentSteps.map((step) => step.id);
      args.setRecentSteps(response.recentSteps);
    }
    if (response.trashedSteps) {
      args.setTrashedSteps(response.trashedSteps);
    }
  };
}
