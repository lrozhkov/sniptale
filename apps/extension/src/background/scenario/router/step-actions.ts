import {
  deleteScenarioStepFromProject,
  moveScenarioStepInProject,
} from '../../../composition/persistence/scenario/store/project-steps/index';
import {
  assertScenarioProjectMatchesSession,
  deleteScenarioStepUseCase,
  moveScenarioStepUseCase,
} from '../application/step-mutation/use-case';
import type { ScenarioStepMutationPorts } from '../application/step-mutation/ports';
import type {
  ScenarioDeleteStepMessage,
  ScenarioMoveStepMessage,
  ScenarioOpenEditorMessage,
} from '../../../contracts/messaging/contracts/types';
import { openScenarioEditor } from '../editor';
import type { ScenarioSessionService } from '../session-service';
import { buildScenarioSessionPayload } from './helpers';

function createScenarioStepMutationPorts(args: {
  scenarioSessionService: ScenarioSessionService;
}): ScenarioStepMutationPorts {
  return {
    buildSessionPayload: (tabId) => buildScenarioSessionPayload(tabId, args.scenarioSessionService),
    bumpProjectRevision: (tabId) => args.scenarioSessionService.bumpProjectRevision(tabId),
    getSession: (tabId) => args.scenarioSessionService.getSession(tabId),
    repository: {
      deleteStepFromProject: deleteScenarioStepFromProject,
      moveStepInProject: moveScenarioStepInProject,
    },
  };
}

export async function handleScenarioDeleteStep(args: {
  message: ScenarioDeleteStepMessage;
  resolvedTabId: number;
  scenarioSessionService: ScenarioSessionService;
}) {
  return deleteScenarioStepUseCase({
    ports: createScenarioStepMutationPorts(args),
    projectId: args.message.projectId,
    stepId: args.message.stepId,
    tabId: args.resolvedTabId,
  });
}

export async function handleScenarioMoveStep(args: {
  message: ScenarioMoveStepMessage;
  resolvedTabId: number;
  scenarioSessionService: ScenarioSessionService;
}) {
  return moveScenarioStepUseCase({
    ports: createScenarioStepMutationPorts(args),
    projectId: args.message.projectId,
    stepId: args.message.stepId,
    tabId: args.resolvedTabId,
    toIndex: args.message.toIndex,
  });
}

export async function handleScenarioOpenEditor(args: {
  message: ScenarioOpenEditorMessage;
  resolvedTabId: number;
  scenarioSessionService: ScenarioSessionService;
}) {
  const session = await args.scenarioSessionService.getSession(args.resolvedTabId);
  const requestedProjectId = args.message.projectId ?? null;
  const projectId = requestedProjectId ?? session.projectId;
  if (requestedProjectId !== null && requestedProjectId !== session.projectId) {
    assertScenarioProjectMatchesSession({
      projectId: requestedProjectId,
      session,
    });
  }
  await openScenarioEditor(projectId, args.message.stepId ?? null);
  return { success: true, result: 'accepted' };
}
