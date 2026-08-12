import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import { handleCoreModeMessage } from './core';
import { createRegionOverlayBridgeDeps, handleRegionOverlayMessage } from './region-overlay';
import { handleViewportMessage } from './viewport';
import type { ContentRuntimeMessage } from './types';
import type { RegionSelectorController } from '../../selection/region-selector/types';
import type { FullPageCaptureAgent } from '../../application/full-page-capture';
import { handleFullPageCaptureMessage } from './full-page-capture';
import { handleVideoRecordingSurfaceSnapshotMessage } from './video-recording-surface';

export function createContentRuntimeMessageHandlers(
  message: ContentRuntimeMessage,
  sendResponse: ResponseSender,
  getViewportInfo: () => ViewportInfo,
  regionSelectorController: Pick<
    RegionSelectorController,
    'hideRecordingOverlay' | 'hideRegionSelector' | 'showRecordingOverlay' | 'showRegionSelector'
  >,
  fullPageCaptureAgent?: FullPageCaptureAgent
) {
  const regionOverlayDeps = createRegionOverlayBridgeDeps(regionSelectorController);

  return [
    () => handleVideoRecordingSurfaceSnapshotMessage(message, sendResponse),
    () => handleCoreModeMessage(message),
    () => handleViewportMessage(message, sendResponse, getViewportInfo, regionSelectorController),
    () => handleRegionOverlayMessage(message, sendResponse, regionOverlayDeps),
    () =>
      fullPageCaptureAgent
        ? handleFullPageCaptureMessage(message, sendResponse, fullPageCaptureAgent)
        : null,
  ];
}
