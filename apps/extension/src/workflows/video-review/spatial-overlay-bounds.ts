import {
  computeQuickEditSpatialRasterLayout,
  type computeQuickEditSceneLayout,
} from '../../features/video/review/advanced/scene';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';
import type { evaluateReviewClicks } from '../../features/video/review/click-animation';
import { pointerFeedbackLensPaintBounds } from '../../features/video/composition/draw/pointer-feedback';

/** Exact pre-projection artwork bounds shared by rendering and physical allocation. */
export function reviewSpatialOverlayBounds(args: {
  output: { width: number; height: number };
  layout: ReturnType<typeof computeQuickEditSceneLayout>;
  background: QuickEditBackgroundSettings;
  sourceWidth: number;
  clicks: ReturnType<typeof evaluateReviewClicks>;
}) {
  const { layout, clicks, output: canvas } = args;
  const overlayLayout = layout.spatial
    ? computeQuickEditSpatialRasterLayout(layout, args.background)
    : layout;
  let overlayBounds = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  if (layout.spatial) {
    const video = overlayLayout.videoTransform;
    const scale = video.width / Math.max(1, args.sourceWidth);
    for (const click of clicks) {
      const bounds = pointerFeedbackLensPaintBounds({
        ...click,
        point: {
          x: video.x + click.point.x * video.width,
          y: video.y + click.point.y * video.height,
        },
        radius: click.radius * scale,
        stroke: click.stroke * scale,
      });
      if (!bounds) continue;
      const x = Math.min(overlayBounds.x, bounds.x),
        y = Math.min(overlayBounds.y, bounds.y);
      overlayBounds = {
        x,
        y,
        width: Math.max(overlayBounds.x + overlayBounds.width, bounds.x + bounds.width) - x,
        height: Math.max(overlayBounds.y + overlayBounds.height, bounds.y + bounds.height) - y,
      };
    }
  }
  return overlayBounds;
}
