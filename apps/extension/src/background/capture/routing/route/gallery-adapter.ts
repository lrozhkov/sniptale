import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  handleRequestGalleryImageUpdateCapability,
  handleSaveScreenshotToGallery,
  handleUpdateGalleryImageAsset,
} from '../actions';
import type { RouteCaptureMessageArgs } from './types';

export function routeGalleryMessage(args: RouteCaptureMessageArgs): boolean {
  const { message, resolvedTabId, sendResponse } = args;
  if (message.type === MessageType.SAVE_SCREENSHOT_TO_GALLERY) {
    return handleSaveScreenshotToGallery(message, resolvedTabId, sendResponse);
  }
  if (message.type === MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY) {
    return handleRequestGalleryImageUpdateCapability(message, args.sender, sendResponse);
  }
  if (message.type === MessageType.UPDATE_GALLERY_IMAGE_ASSET) {
    return handleUpdateGalleryImageAsset(message, args.sender, sendResponse);
  }
  return false;
}
