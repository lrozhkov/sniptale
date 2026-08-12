import { createRouteErrorResponse } from '../../../../routing-contracts/response';
import {
  isRouteCaptureMessage,
  isTabModeMessage,
  isVideoRecordingSurfaceMessage,
} from '../../message-guards/guards/tab';
import { authorizeIPCMessage } from '../../authorization/index';
import type { TabRouteArgs } from '../../boundary/shared';
import type { PrivilegedTabRouteFamily } from '../../boundary/sender-policy';

export function rejectUnauthorizedRouteSender(
  args: TabRouteArgs,
  family: PrivilegedTabRouteFamily
): boolean {
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
    return false;
  }

  args.sendResponse(createRouteErrorResponse(authorization.reason));
  return true;
}
