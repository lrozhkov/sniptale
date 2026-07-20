import type { ScenarioSessionPayload } from '../../../../contracts/messaging/scenario/types';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';

interface ScenarioStepMutationRepository {
  deleteStepFromProject(projectId: string, stepId: string): Promise<unknown | undefined>;
  moveStepInProject(
    projectId: string,
    stepId: string,
    toIndex: number
  ): Promise<unknown | undefined>;
  restoreStepFromProject(projectId: string, stepId: string): Promise<unknown | undefined>;
}

export interface ScenarioStepMutationPorts {
  buildSessionPayload(tabId: number): Promise<ScenarioSessionPayload>;
  bumpProjectRevision(tabId: number): Promise<unknown> | unknown;
  getSession(tabId: number): Promise<ScenarioSessionState>;
  repository: ScenarioStepMutationRepository;
}
