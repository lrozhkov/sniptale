const OVERLAY_TRACK_ORDER = 0;
const PRIMARY_VIDEO_TRACK_ORDER = 1;

/**
 * Places camera sources above ordinary video and below annotations/overlays in render order.
 * Multiple cameras receive stable slots without sharing an order value.
 */
export function resolveVideoProjectCameraTrackOrder(index: number, count: number): number {
  const normalizedCount = Math.max(1, Math.floor(count));
  const normalizedIndex = Math.min(Math.max(0, Math.floor(index)), normalizedCount - 1);
  const step = (PRIMARY_VIDEO_TRACK_ORDER - OVERLAY_TRACK_ORDER) / (normalizedCount + 1);
  return OVERLAY_TRACK_ORDER + step * (normalizedIndex + 1);
}
