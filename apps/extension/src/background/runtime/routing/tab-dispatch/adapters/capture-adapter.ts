import { isRouteCaptureMessage } from '../../message-guards/guards/tab';
import { routeCaptureMessage } from '../../../../capture/routes';
import { authorizeContentSender } from '../../../../routing-contracts/capabilities/content-action/sender-binding';
import {
  ensureActivePageAccessRuntime,
  ensureNativeVisibleCaptureAuthority,
} from '../../../../page-access/service';
import { waitForContentToolbarReady } from '../../../../page-access/readiness';
import { routeWithVerifiedPageAccess } from './page-access-guard';
import { authorizeRouteSender } from './sender-rejection';
import type { ResolvedTabRouteArgs } from './types';
import type { PreauthorizedContentActionBinding } from '../../../../routing-contracts/capabilities/content-action/route';

export function routeResolvedCaptureMessage(args: ResolvedTabRouteArgs): boolean {
  const message = args.message;
  if (!isRouteCaptureMessage(message)) {
    return false;
  }

  let contentPreauthorization: PreauthorizedContentActionBinding | undefined;
  const route = () =>
    routeCaptureMessage({
      message,
      resolvedTabId: args.resolvedTabId,
      sendResponse: args.sendResponse,
      viewportState: args.deps.viewportState,
      screenshotModeState: args.deps.screenshotModeState,
      captureGuardState: args.deps.captureGuardState,
      pageAccessPort: {
        ensureActivePageAccessRuntime,
        ensureNativeVisibleCaptureAuthority,
        waitForContentToolbarReady,
      },
      scenarioSessionService: args.deps.scenarioSessionService,
      sender: args.sender,
      ...(contentPreauthorization ? { contentPreauthorization } : {}),
      webSnapshotViewerPorts: args.deps.webSnapshotViewerPorts,
    });

  const authorize = () => {
    const authorization = authorizeRouteSender(args, 'capture');
    if (!authorization.authorized) {
      return false;
    }
    contentPreauthorization =
      authorization.preauthorization?.kind === 'privileged-tab-route'
        ? authorization.preauthorization.senderBinding
        : undefined;
    return true;
  };

  if (authorizeContentSender(args.sender, args.resolvedTabId).allowed) {
    return routeWithVerifiedPageAccess(args, authorize, route);
  }

  if (!authorize()) {
    return true;
  }

  return route();
}
