import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import {
  getScreenshotSurfaceCapabilityToken,
  getScreenshotSurfaceLeaseGeneration,
  nextScreenshotSurfaceOperationGeneration,
  setScreenshotSurfaceBinding,
} from '../../viewport-selector/capability';
import type { ToolbarViewportSelection } from '../types';
import { getViewportPresetErrorMessage } from '../../../../features/viewport-presets/error-message';
import {
  attachContentActionIntent,
  type ContentPrivilegedActionIntentSource,
} from '../../../application/privileged-action-intent';
import type { ContentPrivilegedActionCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';

const logger = createLogger({ namespace: 'ContentToolbarShell' });

async function refreshToolbarViewportStatus(
  setCurrentViewport: (viewport: { width: number; height: number } | null) => void
) {
  const status = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCREENSHOT_MODE_STATUS,
  });
  setCurrentViewport(status?.success ? (status.viewport ?? null) : null);
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

async function renewToolbarSurfaceSession(
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

async function sendToolbarSurfaceMutation(viewport: ToolbarViewportSelection) {
  const surfaceCapabilityToken = getScreenshotSurfaceCapabilityToken();
  if (!surfaceCapabilityToken) throw new Error('authorization-expired');
  const operationGeneration = nextScreenshotSurfaceOperationGeneration();
  if (viewport === null) {
    const leaseGeneration = getScreenshotSurfaceLeaseGeneration();
    if (leaseGeneration === null) return { success: true as const };
    return getContentRuntimeServices().messaging.sendRuntimeMessage({
      type: MessageType.RELEASE_VIEWPORT_PRESET,
      leaseGeneration,
      operationGeneration,
      surfaceCapabilityToken,
    });
  }
  return getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.APPLY_VIEWPORT_PRESET,
    operationGeneration,
    presetId: viewport.presetId!,
    surfaceCapabilityToken,
  });
}

export async function handleToolbarViewportChange(
  viewport: ToolbarViewportSelection,
  setCurrentViewport: (viewport: { width: number; height: number } | null) => void,
  mutateViewport?: (viewport: ToolbarViewportSelection) => Promise<void>,
  contentIntentSource?: ContentPrivilegedActionIntentSource | null
) {
  try {
    let surfaceSessionRenewed = false;
    const renewSurfaceSessionOnce = async () => {
      if (surfaceSessionRenewed) throw new Error('authorization-expired');
      surfaceSessionRenewed = true;
      await renewToolbarSurfaceSession(contentIntentSource);
    };
    if (mutateViewport) {
      await mutateViewport(viewport);
      setCurrentViewport(viewport ? { width: viewport.width, height: viewport.height } : null);
      return;
    }
    if (viewport && !viewport.presetId) throw new Error('Size preset ID is missing');
    if (!getScreenshotSurfaceCapabilityToken()) {
      await renewSurfaceSessionOnce();
    }
    let response = await sendToolbarSurfaceMutation(viewport);
    if (!response?.success && response?.error === 'authorization-expired') {
      await renewSurfaceSessionOnce();
      response = await sendToolbarSurfaceMutation(viewport);
    }

    if (response?.success) {
      await refreshToolbarViewportStatus(setCurrentViewport);
      return;
    }

    if (response?.error === 'surface-busy') {
      setCurrentViewport(null);
      showToast(translate('content.toolbar.viewportConflictError'), 'error', 5000);
      return;
    }

    const errorMessage =
      getViewportPresetErrorMessage(response?.error) ??
      response?.error ??
      translate('content.toolbar.unknownError');
    logger.error('Failed to set viewport', errorMessage);
    if (
      errorMessage.includes(translate('background.runtime.debuggerConflictKeywordExtension')) ||
      errorMessage.includes(translate('background.runtime.debuggerConflictKeywordConflict'))
    ) {
      setCurrentViewport(null);
      showToast(translate('content.toolbar.viewportConflictError'), 'error', 5000);
      return;
    }

    showToast(`${translate('content.toolbar.viewportErrorPrefix')} ${errorMessage}`, 'error');
    await refreshToolbarViewportStatus(setCurrentViewport).catch(() => undefined);
  } catch (error) {
    logger.error('Failed to set viewport', error);
    showToast(
      getViewportPresetErrorMessage(error) ?? translate('content.toolbar.viewportChangeError'),
      'error'
    );
    if (!mutateViewport) {
      await refreshToolbarViewportStatus(setCurrentViewport).catch(() => undefined);
    }
  }
}
