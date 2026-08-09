import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { handleSaveScreenshotToGallery } from '../actions.gallery-update';
import type { RouteCaptureMessageArgs } from './types';

export function routeGalleryMessage(args: RouteCaptureMessageArgs): boolean {
  const { message, resolvedTabId, sendResponse } = args;
  if (message.type === MessageType.SAVE_SCREENSHOT_TO_GALLERY) {
    return handleSaveScreenshotToGallery(message, resolvedTabId, sendResponse);
  }
  return false;
}
