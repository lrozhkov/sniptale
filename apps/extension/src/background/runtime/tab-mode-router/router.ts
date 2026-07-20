import { routeHighlighterMessage, routeQuickEditMessage } from './editing';
import { routeScreenshotModeMessage, routeViewportMessage } from './screenshot';
import type { RouteTabModeMessageArgs } from './shared';

export function routeTabModeMessage({
  message,
  resolvedTabId,
  senderDocumentId,
  sendResponse,
  screenshotModeState,
  highlighterModeState,
  quickEditModeState,
  viewportOwnerState,
  viewportState,
  webSnapshotViewerPorts,
}: RouteTabModeMessageArgs): boolean {
  const context = {
    resolvedTabId,
    ...(senderDocumentId ? { senderDocumentId } : {}),
    sendResponse,
    screenshotModeState,
    highlighterModeState,
    quickEditModeState,
    viewportOwnerState,
    viewportState,
    ...(webSnapshotViewerPorts ? { webSnapshotViewerPorts } : {}),
  };

  if (routeScreenshotModeMessage(message, context)) {
    return true;
  }

  if (routeViewportMessage(message, context)) {
    return true;
  }

  if (routeHighlighterMessage(message, context)) {
    return true;
  }

  if (routeQuickEditMessage(message, context)) {
    return true;
  }

  return false;
}
