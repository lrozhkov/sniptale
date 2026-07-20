import { isVideoControlMessage } from '../../message-guards/guards/tab';
import { routeVideoControlMessage } from '../../../../media/routes';
import {
  ensureActivePageAccessRuntime,
  ensureNativeVisibleCaptureAuthority,
} from '../../../page-access/service';
import { rejectUnauthorizedRouteSender } from './sender-rejection';
import type { ResolvedTabRouteArgs } from './types';

export function routeResolvedVideoControlMessage(args: ResolvedTabRouteArgs): boolean {
  if (!isVideoControlMessage(args.message)) {
    return false;
  }
  if (rejectUnauthorizedRouteSender(args, 'video-control')) {
    return true;
  }

  routeVideoControlMessage({
    message: args.message,
    pageAccessPort: { ensureActivePageAccessRuntime, ensureNativeVisibleCaptureAuthority },
    resolvedTabId: args.resolvedTabId,
    sendResponse: args.sendResponse,
    sender: args.sender,
  });
  return true;
}
