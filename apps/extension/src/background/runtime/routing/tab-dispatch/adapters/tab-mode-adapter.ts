import { isTabModeMessage } from '../../message-guards/guards/tab';
import { routeTabModeMessage } from '../../../tab-mode-router';
import { routeWithPageAccess } from './page-access-guard';
import { rejectUnauthorizedRouteSender } from './sender-rejection';
import type { ResolvedTabRouteArgs } from './types';

function resolveSenderDocumentId(sender: chrome.runtime.MessageSender | undefined): string | null {
  return typeof sender?.documentId === 'string' && sender.documentId.length > 0
    ? sender.documentId
    : null;
}

export function routeResolvedTabModeMessage(args: ResolvedTabRouteArgs): boolean {
  if (!isTabModeMessage(args.message)) {
    return false;
  }
  const message = args.message;
  if (rejectUnauthorizedRouteSender(args, 'tab-mode')) {
    return true;
  }

  return routeWithPageAccess(args, () =>
    routeTabModeMessage({
      message,
      resolvedTabId: args.resolvedTabId,
      senderDocumentId: resolveSenderDocumentId(args.sender),
      sendResponse: args.sendResponse,
      screenshotModeState: args.deps.screenshotModeState,
      highlighterModeState: args.deps.highlighterModeState,
      quickEditModeState: args.deps.quickEditModeState,
      viewportOwnerState: args.deps.viewportOwnerState,
      viewportState: args.deps.viewportState,
      ...(args.deps.webSnapshotViewerPorts
        ? { webSnapshotViewerPorts: args.deps.webSnapshotViewerPorts }
        : {}),
    })
  );
}
