import { clamp } from '../../document/model';
import type { ImageEditorController } from '../../controller';
import type { PreviewContentRect } from './helpers';

export function navigateEditorViewportFromClientPoint(args: {
  clientX: number;
  clientY: number;
  controller: Pick<ImageEditorController, 'navigateViewportTo'>;
  previewSurfaceRef: React.RefObject<HTMLDivElement | null>;
  previewSize: { width: number; height: number };
  contentRect: PreviewContentRect;
}) {
  const surface = args.previewSurfaceRef.current;
  if (!surface) {
    return;
  }

  const bounds = surface.getBoundingClientRect();
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    surface.clientWidth <= 0 ||
    surface.clientHeight <= 0 ||
    args.contentRect.width <= 0 ||
    args.contentRect.height <= 0
  ) {
    return;
  }

  const scaleX = bounds.width / surface.offsetWidth;
  const scaleY = bounds.height / surface.offsetHeight;
  const x =
    ((args.clientX - bounds.left - surface.clientLeft * scaleX) / (surface.clientWidth * scaleX)) *
    args.previewSize.width;
  const y =
    ((args.clientY - bounds.top - surface.clientTop * scaleY) / (surface.clientHeight * scaleY)) *
    args.previewSize.height;
  const relativeX = clamp((x - args.contentRect.left) / args.contentRect.width, 0, 1);
  const relativeY = clamp((y - args.contentRect.top) / args.contentRect.height, 0, 1);
  args.controller.navigateViewportTo(relativeX, relativeY);
}
