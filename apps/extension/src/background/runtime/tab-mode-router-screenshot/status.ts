import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { translate } from '../../../platform/i18n';
import { getScreenshotModeCapability } from '../../../features/tab-capabilities/capabilities';
import { getCaptureSurfaceService } from '../../capture-surface';
import type { ModeState, ViewportState } from '../../routing-contracts/tab-mode-state';
import {
  getScreenshotSurfaceCapabilityForDocument,
  getScreenshotSurfaceSession,
} from '../../capture-surface/screenshot-session';

export function getCurrentScreenshotViewport(tabId: number, viewportState: ViewportState) {
  const viewport = viewportState.get(tabId) ?? null;
  if (!viewport) return null;
  const session = getScreenshotSurfaceSession(tabId);
  if (!session || session.activeLeaseGeneration === null) return viewport;
  const applied = getCaptureSurfaceService().getApplied(tabId);
  return applied?.sessionId === session.sessionId &&
    applied.generation === session.activeLeaseGeneration &&
    applied.presetId === viewport.presetId
    ? viewport
    : null;
}

export function buildScreenshotModeStatusResponse(
  tabId: number,
  screenshotModeState: ModeState,
  viewportState: ViewportState,
  sendResponse: ResponseSender,
  senderDocumentId: string | null = null
): boolean {
  const documentScope = senderDocumentId ? { documentId: senderDocumentId } : {};
  const sessionScope = () => {
    const enabled = screenshotModeState.get(tabId) || false;
    const surfaceCapabilityToken = enabled
      ? getScreenshotSurfaceCapabilityForDocument({ documentId: senderDocumentId, tabId })
      : null;
    const surfaceSession = surfaceCapabilityToken ? getScreenshotSurfaceSession(tabId) : null;
    return {
      enabled,
      ...(surfaceCapabilityToken ? { surfaceCapabilityToken } : {}),
      ...(surfaceSession
        ? {
            surfaceOperationGeneration: surfaceSession.lastOperationGeneration,
            ...(surfaceSession.activeLeaseGeneration === null
              ? {}
              : { surfaceLeaseGeneration: surfaceSession.activeLeaseGeneration }),
          }
        : {}),
    };
  };

  Promise.all([browserTabs.get(tabId), browserTabs.getZoom(tabId).catch(() => undefined)])
    .then(([tab, pageZoom]) => {
      const capability = getScreenshotModeCapability(tab);
      sendResponse({
        success: true,
        ...documentScope,
        ...sessionScope(),
        ...(pageZoom === undefined ? {} : { pageZoom }),
        tabId,
        viewport: getCurrentScreenshotViewport(tabId, viewportState),
        supported: capability.supported,
        unsupportedReason: capability.reason,
      });
    })
    .catch(() => {
      sendResponse({
        success: true,
        ...documentScope,
        ...sessionScope(),
        tabId,
        viewport: getCurrentScreenshotViewport(tabId, viewportState),
        supported: false,
        unsupportedReason: translate('popup.common.noActiveTab'),
      });
    });

  return true;
}
