import type { Canvas } from 'fabric';

export function applySceneToOverlayTransform(args: {
  canvas: Canvas | null;
  context: CanvasRenderingContext2D;
  size: { width: number; height: number };
}) {
  const logicalSize = getCanvasLogicalSize(args.canvas);
  if (logicalSize) {
    args.context.transform(
      args.size.width / logicalSize.width,
      0,
      0,
      args.size.height / logicalSize.height,
      0,
      0
    );
  }

  if (args.canvas?.viewportTransform) {
    args.context.transform(...args.canvas.viewportTransform);
  }
}

function getCanvasLogicalSize(canvas: Canvas | null): { width: number; height: number } | null {
  if (!canvas || typeof canvas.getWidth !== 'function' || typeof canvas.getHeight !== 'function') {
    return null;
  }
  const width = canvas.getWidth();
  const height = canvas.getHeight();
  if (!isPositiveFinite(width) || !isPositiveFinite(height)) {
    return null;
  }
  return { width, height };
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
