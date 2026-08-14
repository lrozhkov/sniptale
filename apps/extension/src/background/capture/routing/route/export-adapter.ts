import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { handleExportCaptureFullPage } from '../actions.export';
import type { RouteCaptureMessageArgs } from './types';

export function routeExportMessage(args: RouteCaptureMessageArgs): boolean {
  const { message, resolvedTabId, sendResponse } = args;
  if (message.type === MessageType.EXECUTE_SAVE) {
    return false;
  }
  if (message.type === MessageType.EXPORT_CAPTURE_FULL_PAGE) {
    return handleExportCaptureFullPage(message, resolvedTabId, sendResponse, args.pageAccessPort);
  }
  return false;
}
