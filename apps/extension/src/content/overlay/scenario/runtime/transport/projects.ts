import { getContentRuntimeServices } from '../../../../application/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export function setScenarioActiveProject(args: {
  projectId: string | null;
  rememberProjectSelection: boolean;
}) {
  return getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCENARIO_SET_ACTIVE_PROJECT,
    projectId: args.projectId,
    rememberProjectSelection: args.rememberProjectSelection,
  });
}

export function createScenarioProject(args: { name: string; rememberProjectSelection: boolean }) {
  return getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCENARIO_CREATE_PROJECT,
    name: args.name,
    rememberProjectSelection: args.rememberProjectSelection,
  });
}

export async function openScenarioEditor(args: {
  projectId: string | null;
  stepId?: string | null;
}): Promise<void> {
  await getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCENARIO_OPEN_EDITOR,
    projectId: args.projectId,
    ...(args.stepId === undefined ? {} : { stepId: args.stepId }),
  });
}
