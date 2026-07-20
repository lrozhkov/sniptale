import type { ScenarioSessionResponse } from '../../../../contracts/messaging/contracts/response-types';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioStepMutationPorts } from './ports';

const UNAUTHORIZED_SCENARIO_PROJECT_MUTATION = 'Unauthorized scenario project mutation';

export function assertScenarioProjectMatchesSession(args: {
  projectId: string;
  session: Pick<ScenarioSessionState, 'projectId'>;
}): void {
  if (args.session.projectId !== args.projectId) {
    throw new Error(UNAUTHORIZED_SCENARIO_PROJECT_MUTATION);
  }
}

export async function assertActiveScenarioProjectAuthority(args: {
  ports: Pick<ScenarioStepMutationPorts, 'getSession'>;
  projectId: string;
  tabId: number;
}): Promise<void> {
  const session = await args.ports.getSession(args.tabId);
  assertScenarioProjectMatchesSession({
    projectId: args.projectId,
    session,
  });
}

async function buildMutationResponse(args: {
  ports: ScenarioStepMutationPorts;
  tabId: number;
}): Promise<ScenarioSessionResponse> {
  return {
    success: true,
    ...(await args.ports.buildSessionPayload(args.tabId)),
  };
}

async function runAuthorizedStepMutation(args: {
  mutateProject: () => Promise<unknown | undefined>;
  ports: ScenarioStepMutationPorts;
  projectId: string;
  tabId: number;
}): Promise<ScenarioSessionResponse> {
  await assertActiveScenarioProjectAuthority({
    ports: args.ports,
    projectId: args.projectId,
    tabId: args.tabId,
  });

  const project = await args.mutateProject();
  if (project) {
    await args.ports.bumpProjectRevision(args.tabId);
  }

  return buildMutationResponse({
    ports: args.ports,
    tabId: args.tabId,
  });
}

export function deleteScenarioStepUseCase(args: {
  ports: ScenarioStepMutationPorts;
  projectId: string;
  stepId: string;
  tabId: number;
}): Promise<ScenarioSessionResponse> {
  return runAuthorizedStepMutation({
    mutateProject: () => args.ports.repository.deleteStepFromProject(args.projectId, args.stepId),
    ports: args.ports,
    projectId: args.projectId,
    tabId: args.tabId,
  });
}

export function moveScenarioStepUseCase(args: {
  ports: ScenarioStepMutationPorts;
  projectId: string;
  stepId: string;
  tabId: number;
  toIndex: number;
}): Promise<ScenarioSessionResponse> {
  return runAuthorizedStepMutation({
    mutateProject: () =>
      args.ports.repository.moveStepInProject(args.projectId, args.stepId, args.toIndex),
    ports: args.ports,
    projectId: args.projectId,
    tabId: args.tabId,
  });
}

export function restoreScenarioStepUseCase(args: {
  ports: ScenarioStepMutationPorts;
  projectId: string;
  stepId: string;
  tabId: number;
}): Promise<ScenarioSessionResponse> {
  return runAuthorizedStepMutation({
    mutateProject: () => args.ports.repository.restoreStepFromProject(args.projectId, args.stepId),
    ports: args.ports,
    projectId: args.projectId,
    tabId: args.tabId,
  });
}
