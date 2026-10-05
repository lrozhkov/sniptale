import { drawReviewSceneShadow } from '../../workflows/video-review/scene-shadow';
import { serializePaintToCss } from '@sniptale/foundation/paint';
import {
  computeQuickEditSceneCamera,
  computeQuickEditWindowTransform,
  computeQuickEditVisibleSourceRect,
} from '../../features/video/review/advanced/scene';
import type {
  QuickEditBackgroundSettings,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import type {
  computeQuickEditSceneLayout,
  QuickEditRect,
} from '../../features/video/review/advanced/scene';
import type { ZoomPreviewFrame } from './use-zoom-preview-source';

export type ZoomPreviewLayout = ReturnType<typeof computeQuickEditSceneLayout>;

/** Paints the clipped frame, inverse-projected crop footprint and focus over the CSS background. */
export function paintZoomPreview(
  context: CanvasRenderingContext2D,
  args: {
    background?: QuickEditBackgroundSettings;
    headerImage?: CanvasImageSource | null | undefined;
    accent: string;
    camera: QuickEditZoomRegion['transform'];
    frame: ZoomPreviewFrame | null;
    height: number;
    layout: ZoomPreviewLayout;
    view: 'area' | 'result';
    width: number;
    cornerRadius?: number;
    previewScale?: number;
    showControls?: boolean;
  }
) {
  const { videoRect, videoTransform } = args.layout;
  const motion = computeQuickEditSceneCamera(args.layout, args.background ?? { enabled: false });
  const clip = args.view === 'area' ? args.layout.windowRect : motion.windowClip;
  context.clearRect(0, 0, args.width, args.height);
  drawReviewSceneShadow(
    context,
    args.background ?? { enabled: false },
    clip,
    (args.cornerRadius ?? 0) * (args.view === 'result' ? motion.scale : 1),
    (args.previewScale ?? 1) * (args.view === 'result' ? motion.scale : 1)
  );
  context.save();
  context.beginPath();
  context.roundRect(
    clip.x,
    clip.y,
    clip.width,
    clip.height,
    (args.cornerRadius ?? 0) * (args.view === 'result' ? motion.scale : 1)
  );
  context.clip();
  const target = args.view === 'area' ? videoRect : videoTransform;
  const window =
    args.view === 'area' ? args.layout.windowRect : computeQuickEditWindowTransform(args.layout);
  if (args.headerImage)
    context.drawImage(args.headerImage, window.x, window.y, window.width, target.y - window.y);
  if (args.frame)
    context.drawImage(args.frame.image, target.x, target.y, target.width, target.height);
  else {
    context.fillStyle = '#000000';
    context.fillRect(target.x, target.y, target.width, target.height);
  }
  context.restore();
  if (args.view !== 'area' || args.showControls === false) return;
  const visible = computeZoomPreviewArea(args.layout, args.background ?? { enabled: false }, args);
  const footprint: QuickEditRect = {
    x: args.layout.windowRect.x + visible.x * args.layout.windowRect.width,
    y: args.layout.windowRect.y + visible.y * args.layout.windowRect.height,
    width: visible.width * args.layout.windowRect.width,
    height: visible.height * args.layout.windowRect.height,
  };
  context.strokeStyle = args.accent;
  context.lineWidth = 2;
  context.strokeRect(footprint.x, footprint.y, footprint.width, footprint.height);
  context.fillStyle = args.accent;
  context.beginPath();
  context.arc(
    footprint.x + footprint.width / 2,
    footprint.y + footprint.height / 2,
    3,
    0,
    Math.PI * 2
  );
  context.fill();
}

/** CSS background paint shared by the source preview and its camera canvas. */
export function previewBackgroundPaint(background: QuickEditBackgroundSettings): string {
  if (!background.enabled || background.type === 'image') return '#000000';
  if (background.type === 'solid') return background.color;
  return serializePaintToCss({ kind: 'gradient', gradient: background.gradient });
}

/** Inspector footprint in normalized window coordinates; Follow Video includes the whole scene, not only video pixels. */
export function computeZoomPreviewArea(
  layout: ZoomPreviewLayout,
  background: QuickEditBackgroundSettings,
  output: { width: number; height: number }
): QuickEditRect {
  const source =
    !background.enabled || background.zoomBehavior !== 'follow-video'
      ? computeQuickEditVisibleSourceRect(layout, background, output)
      : {
          x: -layout.videoTransform.x / layout.videoTransform.width,
          y: -layout.videoTransform.y / layout.videoTransform.height,
          width: output.width / layout.videoTransform.width,
          height: output.height / layout.videoTransform.height,
        };
  const window = layout.windowRect;
  const video = layout.videoRect;
  return {
    x: (video.x - window.x + source.x * video.width) / window.width,
    y: (video.y - window.y + source.y * video.height) / window.height,
    width: (source.width * video.width) / window.width,
    height: (source.height * video.height) / window.height,
  };
}
