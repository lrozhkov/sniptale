import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import type { ContentPrivilegedActionCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import {
  attachContentActionIntent,
  type ContentPrivilegedActionIntentSource,
} from '../../../application/privileged-action-intent';
import { setScreenshotSurfaceBinding } from '../../viewport-selector/capability';

export async function refreshToolbarSurfaceSession() {
  const status = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCREENSHOT_MODE_STATUS,
  });
  if (status?.success) {
    setScreenshotSurfaceBinding({
      token: status.enabled ? (status.surfaceCapabilityToken ?? null) : null,
      ...(status.surfaceLeaseGeneration === undefined
        ? {}
        : { leaseGeneration: status.surfaceLeaseGeneration }),
      ...(status.surfaceOperationGeneration === undefined
        ? {}
        : { operationGeneration: status.surfaceOperationGeneration }),
    });
  }
  return status;
}

export async function renewToolbarSurfaceSession(
  contentIntentSource: ContentPrivilegedActionIntentSource | null | undefined
): Promise<void> {
  if (!contentIntentSource) throw new Error('authorization-expired');
  const renewalRequest: {
    contentIntent?: ContentPrivilegedActionCapability;
    type: typeof CaptureMessageType.RENEW_SCREENSHOT_SURFACE_SESSION;
  } = { type: CaptureMessageType.RENEW_SCREENSHOT_SURFACE_SESSION };
  const message = await attachContentActionIntent(renewalRequest, contentIntentSource);
  if (!message.contentIntent) throw new Error('authorization-expired');
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    contentIntent: message.contentIntent,
    type: CaptureMessageType.RENEW_SCREENSHOT_SURFACE_SESSION,
  });
  if (!response?.success || !response.surfaceCapabilityToken) {
    throw new Error(response?.error ?? 'authorization-expired');
  }
  setScreenshotSurfaceBinding({
    token: response.surfaceCapabilityToken,
    ...(response.surfaceLeaseGeneration === undefined
      ? {}
      : { leaseGeneration: response.surfaceLeaseGeneration }),
    operationGeneration: response.surfaceOperationGeneration,
  });
}
