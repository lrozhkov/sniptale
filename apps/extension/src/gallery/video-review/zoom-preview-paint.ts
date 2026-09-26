import {
  computeQuickEditSceneCamera,
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
    accent: string;
    camera: QuickEditZoomRegion['transform'];
    frame: ZoomPreviewFrame | null;
    height: number;
    layout: ZoomPreviewLayout;
    view: 'area' | 'result';
    width: number;
    cornerRadius?: number;
  }
) {
  const { videoRect, videoTransform } = args.layout;
  const motion = computeQuickEditSceneCamera(args.layout, args.background ?? { enabled: false });
  const clip = args.view === 'area' ? videoRect : motion.videoClip;
  context.clearRect(0, 0, args.width, args.height);
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
  if (args.frame)
    context.drawImage(args.frame.image, target.x, target.y, target.width, target.height);
  else {
    context.fillStyle = '#000000';
    context.fillRect(target.x, target.y, target.width, target.height);
  }
  context.restore();
  if (args.view === 'area') {
    const visible = computeQuickEditVisibleSourceRect(
      args.layout,
      args.background ?? { enabled: false },
      args
    );
    const footprint: QuickEditRect = {
      x: videoRect.x + visible.x * videoRect.width,
      y: videoRect.y + visible.y * videoRect.height,
      width: visible.width * videoRect.width,
      height: visible.height * videoRect.height,
    };
    context.strokeStyle = args.accent;
    context.lineWidth = 2;
    context.strokeRect(footprint.x, footprint.y, footprint.width, footprint.height);
  }
  if (args.view !== 'area') return;
  context.fillStyle = args.accent;
  context.beginPath();
  context.arc(
    videoRect.x + args.camera.centerX * videoRect.width,
    videoRect.y + args.camera.centerY * videoRect.height,
    3,
    0,
    Math.PI * 2
  );
  context.fill();
}
