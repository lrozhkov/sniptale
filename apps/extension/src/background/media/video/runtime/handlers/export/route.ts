import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRuntimeMessage } from '../../../../../../contracts/video/types/messages';
import type { ProjectExportPreauthorization } from '../../../../../routing-contracts/project-export-preauthorization';
import {
  handleCancelProjectExport,
  handleGetProjectExportCapabilities,
  handleStartProjectExport,
} from './project-export';
import { type RouteResult } from '../shared';
import { resolveTrustedVideoEditorRuntimeSender } from '../../sender-policy';

export function routeExportRuntimeMessage(
  message: VideoRuntimeMessage,
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender,
  projectExportPreauthorization?: ProjectExportPreauthorization
): RouteResult | null {
  if (message.type === VideoMessageType.START_PROJECT_EXPORT) {
    return routeStartProjectExport(message, sendResponse, projectExportPreauthorization);
  }
  if (message.type === VideoMessageType.CANCEL_PROJECT_EXPORT) {
    return routeCancelProjectExport(message, sendResponse, projectExportPreauthorization);
  }
  if (message.type === VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES) {
    return routeGetProjectExportCapabilities(message, sendResponse, sender);
  }
  return null;
}

function routeStartProjectExport(
  message: Extract<VideoRuntimeMessage, { type: typeof VideoMessageType.START_PROJECT_EXPORT }>,
  sendResponse: ResponseSender,
  owner: ProjectExportPreauthorization | undefined
): RouteResult {
  if (!hasProjectExportPreauthorization(owner, sendResponse)) {
    return { handled: true, keepChannelOpen: false };
  }
  handleStartProjectExport(message, sendResponse, owner);
  return { handled: true, keepChannelOpen: true };
}

function routeCancelProjectExport(
  message: Extract<VideoRuntimeMessage, { type: typeof VideoMessageType.CANCEL_PROJECT_EXPORT }>,
  sendResponse: ResponseSender,
  owner: ProjectExportPreauthorization | undefined
): RouteResult {
  if (!hasProjectExportPreauthorization(owner, sendResponse)) {
    return { handled: true, keepChannelOpen: false };
  }
  handleCancelProjectExport(message, sendResponse);
  return { handled: true, keepChannelOpen: true };
}

function hasProjectExportPreauthorization(
  owner: ProjectExportPreauthorization | undefined,
  sendResponse: ResponseSender
): owner is ProjectExportPreauthorization {
  if (owner) {
    return true;
  }

  sendResponse({ success: false, error: 'Unauthorized project export capability' });
  return false;
}

function routeGetProjectExportCapabilities(
  message: Extract<
    VideoRuntimeMessage,
    { type: typeof VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES }
  >,
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender
): RouteResult {
  const owner = resolveTrustedProjectExportSender(sender, sendResponse);
  return owner
    ? handleGetProjectExportCapabilities(message, sendResponse, owner)
    : { handled: true, keepChannelOpen: false };
}

function resolveTrustedProjectExportSender(
  sender: chrome.runtime.MessageSender | undefined,
  sendResponse: ResponseSender
): ReturnType<typeof resolveTrustedVideoEditorRuntimeSender> {
  const owner = resolveTrustedVideoEditorRuntimeSender(sender);
  if (owner) {
    return owner;
  }

  sendResponse({ success: false, error: 'Unauthorized video export sender' });
  return null;
}
