import type { ScenarioRuntimeCapturePayload } from '../../../../../contracts/messaging/contracts/types';
import type { ScenarioSessionResponse } from '../../../../../contracts/messaging/contracts/response-types';
import { getContentRuntimeServices } from '../../../../application/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export function deleteScenarioStep(args: { projectId: string; stepId: string }) {
  return getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCENARIO_DELETE_STEP,
    projectId: args.projectId,
    stepId: args.stepId,
  });
}

export function moveScenarioStep(args: { projectId: string; stepId: string; toIndex: number }) {
  return getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCENARIO_MOVE_STEP,
    projectId: args.projectId,
    stepId: args.stepId,
    toIndex: args.toIndex,
  });
}

export function restoreScenarioStep(args: { projectId: string; stepId: string }) {
  return getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCENARIO_RESTORE_STEP,
    projectId: args.projectId,
    stepId: args.stepId,
  });
}

export function saveScenarioCaptureStep(args: {
  dataUrl: string;
  filename: string;
  galleryAssetId?: string | null;
  scenarioCapture: ScenarioRuntimeCapturePayload;
}): Promise<ScenarioSessionResponse> {
  return getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCENARIO_SAVE_CAPTURE_STEP,
    dataUrl: args.dataUrl,
    filename: args.filename,
    ...(args.galleryAssetId === undefined ? {} : { galleryAssetId: args.galleryAssetId }),
    ...args.scenarioCapture,
  });
}
