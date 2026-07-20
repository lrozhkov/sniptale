import { isRouteCaptureMessage } from '../../message-guards/guards/tab';
import { routeCaptureMessage } from '../../../../capture/routes';
import { authorizeContentSender } from '../../../../routing-contracts/capabilities/content-action/sender-binding';
import {
  ensureActivePageAccessRuntime,
  ensureNativeVisibleCaptureAuthority,
} from '../../../page-access/service';
import { routeWithVerifiedPageAccess } from './page-access-guard';
import { rejectUnauthorizedRouteSender } from './sender-rejection';
import type { ResolvedTabRouteArgs } from './types';

export function routeResolvedCaptureMessage(args: ResolvedTabRouteArgs): boolean {
  const message = args.message;
  if (!isRouteCaptureMessage(message)) {
    return false;
  }

  const route = () =>
    routeCaptureMessage({
      message,
      resolvedTabId: args.resolvedTabId,
      sendResponse: args.sendResponse,
      viewportState: args.deps.viewportState,
      screenshotModeState: args.deps.screenshotModeState,
      captureGuardState: args.deps.captureGuardState,
      pageAccessPort: { ensureActivePageAccessRuntime, ensureNativeVisibleCaptureAuthority },
      scenarioSessionService: args.deps.scenarioSessionService,
      sender: args.sender,
      webSnapshotViewerPorts: args.deps.webSnapshotViewerPorts,
    });

  if (authorizeContentSender(args.sender, args.resolvedTabId).allowed) {
    return routeWithVerifiedPageAccess(
      args,
      () => !rejectUnauthorizedRouteSender(args, 'capture'),
      route
    );
  }

  if (rejectUnauthorizedRouteSender(args, 'capture')) {
    return true;
  }

  return route();
}
