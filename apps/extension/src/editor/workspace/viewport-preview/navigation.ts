import { clamp } from '../../document/model';
import type { ImageEditorController } from '../../controller';

export function navigateEditorViewportFromClientPoint(args: {
  clientX: number;
  clientY: number;
  controller: Pick<ImageEditorController, 'navigateViewportTo'>;
  previewSurfaceRef: React.RefObject<HTMLDivElement | null>;
}) {
  const surface = args.previewSurfaceRef.current;
  if (!surface) {
    return;
  }

  const bounds = surface.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return;
  }

  const relativeX = clamp((args.clientX - bounds.left) / bounds.width, 0, 1);
  const relativeY = clamp((args.clientY - bounds.top) / bounds.height, 0, 1);
  args.controller.navigateViewportTo(relativeX, relativeY);
}
