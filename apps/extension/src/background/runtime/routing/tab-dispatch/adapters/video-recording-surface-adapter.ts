import {
  isActivateVideoRecordingSurfaceMessage,
  isReleaseVideoRecordingSurfaceMessage,
  isStartSavedTabVideoRecordingMessage,
  isVideoRecordingSurfaceCommandMessage,
  isVideoRecordingCameraOfferMessage,
  isVideoRecordingCameraCloseMessage,
} from '@sniptale/runtime-contracts/video/types/messages.surface';
import { routeVideoRecordingSurfaceMessage } from '../../../../media/video/content-surface/route';
import { rejectUnauthorizedRouteSender } from './sender-rejection';
import type { ResolvedTabRouteArgs } from './types';

function isVideoRecordingSurfaceMessage(message: unknown): boolean {
  return (
    isStartSavedTabVideoRecordingMessage(message) ||
    isActivateVideoRecordingSurfaceMessage(message) ||
    isReleaseVideoRecordingSurfaceMessage(message) ||
    isVideoRecordingSurfaceCommandMessage(message) ||
    isVideoRecordingCameraOfferMessage(message) ||
    isVideoRecordingCameraCloseMessage(message)
  );
}

export function routeResolvedVideoRecordingSurfaceMessage(args: ResolvedTabRouteArgs): boolean {
  if (!isVideoRecordingSurfaceMessage(args.message)) return false;
  if (rejectUnauthorizedRouteSender(args, 'video-recording-surface')) return true;
  routeVideoRecordingSurfaceMessage({
    message: args.message as Parameters<typeof routeVideoRecordingSurfaceMessage>[0]['message'],
    resolvedTabId: args.resolvedTabId,
    sendResponse: args.sendResponse,
    sender: args.sender,
  });
  return true;
}
