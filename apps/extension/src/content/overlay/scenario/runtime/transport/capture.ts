import type { CaptureResponse as RuntimeCaptureResponse } from '../../../../../contracts/messaging/contracts/response-types';
import type { ScenarioRuntimeCapturePayload } from '../../../../../contracts/messaging/contracts/types';
import { getContentRuntimeServices } from '../../../../application/runtime-services/services';
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
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
