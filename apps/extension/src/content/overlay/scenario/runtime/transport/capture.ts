import type {
  CaptureResponse as RuntimeCaptureResponse,
  ScenarioSessionResponse,
} from '../../../../../contracts/messaging/contracts/response-types';
import type { ScenarioRuntimeCapturePayload } from '../../../../../contracts/messaging/contracts/types';
import type { ScenarioTargetDescriptor } from '@sniptale/runtime-contracts/scenario/types/geometry';
import { getContentRuntimeServices } from '../../../../application/runtime-services/services';
import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import {
  attachContentActionIntent,
  type ContentPrivilegedActionIntentSource,
} from '../../../../application/privileged-action-intent';

export async function captureVisibleScenarioInteraction(
  payload: ScenarioRuntimeCapturePayload,
  options?: { contentIntentSource?: ContentPrivilegedActionIntentSource | undefined }
): Promise<RuntimeCaptureResponse> {
  const message = {
    type: CaptureMessageType.CAPTURE_VISIBLE,
    actionType: 'scenario' as const,
    scenarioCapture: payload,
  };
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage(
    await attachContentActionIntent(message, options?.contentIntentSource)
  );
  return response ?? { success: false, error: 'Scenario capture did not return a response.' };
}

export function recordScenarioSuggestedEvent(args: {
  kind: 'change' | 'input' | 'keydown' | 'scroll';
  message: string;
  target?: ScenarioTargetDescriptor | null;
}): Promise<ScenarioSessionResponse> {
  return getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCENARIO_RECORD_SUGGESTED_EVENT,
    kind: args.kind,
    message: args.message,
    ...(args.target === undefined ? {} : { target: args.target }),
  });
}
