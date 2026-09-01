import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { handleExecuteSave, handleOpenEditorWithImage } from '../actions.download';
import type { RouteCaptureMessageArgs } from './types';

export function routeDownloadMessage(args: RouteCaptureMessageArgs): boolean {
  const { message, resolvedTabId, sendResponse } = args;
  if (message.type === MessageType.EXECUTE_SAVE) {
    return handleExecuteSave(message, resolvedTabId, sendResponse);
  }
  if (message.type === MessageType.OPEN_EDITOR_WITH_IMAGE) {
    return handleOpenEditorWithImage(
      message,
      resolvedTabId,
      sendResponse,
      args.contentPreauthorization
    );
  }
  return false;
}
