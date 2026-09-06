import { createRouteErrorResponse } from '../../../../routing-contracts/response';
import {
  isRouteCaptureMessage,
  isTabModeMessage,
  isVideoRecordingSurfaceMessage,
} from '../../message-guards/guards/tab';
import { authorizeIPCMessage } from '../../authorization/index';
import type { IpcAuthorizationResult } from '../../../../routing-contracts/authorization-result';
import type { TabRouteArgs } from '../../boundary/shared';
import type { PrivilegedTabRouteFamily } from '../../boundary/sender-policy';

export function rejectUnauthorizedRouteSender(
  args: TabRouteArgs,
  family: PrivilegedTabRouteFamily
): boolean {
  return !authorizeRouteSender(args, family).authorized;
}

export function authorizeRouteSender(
  args: TabRouteArgs,
  family: PrivilegedTabRouteFamily
): IpcAuthorizationResult {
  const authorization = authorizeIPCMessage({
    family,
    kind: 'privileged-tab-route',
    message:
      isRouteCaptureMessage(args.message) ||
      isTabModeMessage(args.message) ||
      isVideoRecordingSurfaceMessage(args.message)
        ? args.message
        : undefined,
    resolvedTabId: args.resolvedTabId,
    sender: args.sender,
  });
  if (authorization.authorized) {
    return authorization;
  }

  args.sendResponse(createRouteErrorResponse(authorization.reason));
  return authorization;
}
