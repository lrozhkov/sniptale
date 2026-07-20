import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  handleExportCaptureFullPage,
  handleExportStartHar,
  handleExportStopHar,
  handleRequestExportHarStartCapability,
} from '../actions';
import type { RouteCaptureMessageArgs } from './types';

export function routeExportMessage(args: RouteCaptureMessageArgs): boolean {
  const { message, resolvedTabId, sendResponse } = args;
  if (message.type === MessageType.EXECUTE_SAVE) {
    return false;
  }
  if (message.type === MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY) {
    return handleRequestExportHarStartCapability(message, resolvedTabId, args.sender, sendResponse);
  }
  if (message.type === MessageType.EXPORT_START_HAR) {
    return handleExportStartHar(message, resolvedTabId, sendResponse, args.sender);
  }
  if (message.type === MessageType.EXPORT_STOP_HAR) {
    return handleExportStopHar(message, resolvedTabId, sendResponse);
  }
  if (message.type === MessageType.EXPORT_CAPTURE_FULL_PAGE) {
    return handleExportCaptureFullPage(resolvedTabId, sendResponse);
  }
  return false;
}
