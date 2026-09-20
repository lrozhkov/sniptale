import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
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
  context.clearRect(0, 0, args.width, args.height);
  context.save();
  context.beginPath();
  context.roundRect(
    videoRect.x,
    videoRect.y,
    videoRect.width,
    videoRect.height,
    args.cornerRadius ?? 0
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
    const footprint: QuickEditRect = {
      x: videoRect.x + ((videoRect.x - videoTransform.x) / videoTransform.width) * videoRect.width,
      y:
        videoRect.y + ((videoRect.y - videoTransform.y) / videoTransform.height) * videoRect.height,
      width: videoRect.width / args.camera.scale,
      height: videoRect.height / args.camera.scale,
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
