import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import { getBackgroundRuntimeMessaging } from '../../routing-contracts/runtime-messaging/services';

function normalizedVisualViewport(viewport: ViewportInfo) {
  return {
    offsetX: viewport.viewportOffsetX ?? 0,
    offsetY: viewport.viewportOffsetY ?? 0,
    scale: viewport.visualViewportScale ?? 1,
  };
}

function assertSupportedCaptureViewport(viewport: ViewportInfo): void {
  const visual = normalizedVisualViewport(viewport);
  if (
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    !Number.isFinite(viewport.devicePixelRatio) ||
    viewport.devicePixelRatio <= 0
  ) {
    throw new Error('Tab capture viewport is invalid');
  }
  if (visual.scale !== 1 || visual.offsetX !== 0 || visual.offsetY !== 0) {
    throw new Error('Tab capture is unavailable while the visual viewport is zoomed or panned');
  }
}

export function captureViewportsEqual(left: ViewportInfo, right: ViewportInfo): boolean {
  const leftVisual = normalizedVisualViewport(left);
  const rightVisual = normalizedVisualViewport(right);
  return (
    left.width === right.width &&
    left.height === right.height &&
    left.devicePixelRatio === right.devicePixelRatio &&
    leftVisual.scale === rightVisual.scale &&
    leftVisual.offsetX === rightVisual.offsetX &&
    leftVisual.offsetY === rightVisual.offsetY
  );
}

export async function readTabCaptureViewport(tabId: number): Promise<ViewportInfo> {
  const response = await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
    type: VideoMessageType.GET_VIEWPORT_COORDS,
  });
  if (response.success !== true || !response.viewport) {
    throw new Error(response.error ?? 'Tab capture viewport is unavailable');
  }
  assertSupportedCaptureViewport(response.viewport);
  return response.viewport;
}
