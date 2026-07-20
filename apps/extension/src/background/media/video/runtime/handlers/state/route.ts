import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRuntimeMessage } from '../../../../../../contracts/video/types/messages';
import {
  handleInternalVideoSignal,
  handleOffscreenReady,
  handleProjectExportLifecycleMessage,
} from './offscreen-lifecycle';
import { type RouteResult } from '../shared';

export function routeStateLifecycleRuntimeMessage(
  message: VideoRuntimeMessage,
  sendResponse: ResponseSender
): RouteResult | null {
  if (message.type === VideoMessageType.OFFSCREEN_READY) {
    return handleOffscreenReady(message, sendResponse);
  }
  if (
    message.type === VideoMessageType.CAPTURE_SOURCE_OBTAINED ||
    message.type === VideoMessageType.DESKTOP_MEDIA_OBTAINED ||
    message.type === VideoMessageType.DESKTOP_MEDIA_CANCELLED ||
    message.type === VideoMessageType.DESKTOP_MEDIA_FAILED
  ) {
    return handleInternalVideoSignal(sendResponse);
  }
  if (
    message.type === VideoMessageType.PROJECT_EXPORT_PROGRESS ||
    message.type === VideoMessageType.PROJECT_EXPORT_COMPLETED ||
    message.type === VideoMessageType.PROJECT_EXPORT_FAILED ||
    message.type === VideoMessageType.PROJECT_EXPORT_CANCELLED
  ) {
    return handleProjectExportLifecycleMessage(message, sendResponse);
  }
  return null;
}
