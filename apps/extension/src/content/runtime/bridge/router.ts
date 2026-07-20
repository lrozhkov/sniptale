import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import { handleCoreModeMessage } from './core';
import { handlePageStyleMessage } from './page-style';
import { handleRegionCaptureMessage } from './region-capture';
import { createRegionOverlayBridgeDeps, handleRegionOverlayMessage } from './region-overlay';
import { handleViewportMessage } from './viewport';
import type { ContentRuntimeMessage } from './types';
import type { RegionSelectorController } from '../../selection/region-selector/types';

export function createContentRuntimeMessageHandlers(
  message: ContentRuntimeMessage,
  sendResponse: ResponseSender,
  getViewportInfo: () => ViewportInfo,
  regionSelectorController: Pick<
    RegionSelectorController,
    'hideRecordingOverlay' | 'hideRegionSelector' | 'showRecordingOverlay' | 'showRegionSelector'
  >
) {
  const regionOverlayDeps = createRegionOverlayBridgeDeps(regionSelectorController);

  return [
    () => handleCoreModeMessage(message),
    () => handlePageStyleMessage(message, sendResponse),
    () => handleViewportMessage(message, sendResponse, getViewportInfo, regionSelectorController),
    () => handleRegionCaptureMessage(message, sendResponse),
    () => handleRegionOverlayMessage(message, sendResponse, regionOverlayDeps),
  ];
}
