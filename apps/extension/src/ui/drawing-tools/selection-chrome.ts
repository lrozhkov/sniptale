import {
  DEFAULT_COLOR_CANVAS_SELECTION,
  DEFAULT_COLOR_CANVAS_MAGNET,
} from '@sniptale/ui/default-colors/constants';

/** Screen-space dimensions shared by the Canvas and SVG adapters. */
export const CANVAS_SELECTION_METRICS = {
  corner: 9,
  sideShort: 6,
  sideLong: 12,
  point: 10,
  rotation: 24,
  rotationOffset: 20,
  hit: 22,
  rotationHit: 28,
  border: 1.25,
} as const;

/** Tabler rotate-dot, bundled geometry in its native 24px coordinate space. */
export const CANVAS_ROTATE_DOT_PATH =
  'M19.95 11a8 8 0 1 0-.5 4m.5 5v-5h-5 M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0';

type CanvasSelectionHandle = 'corner' | 'horizontal' | 'vertical' | 'point';

/** Resolve theme from the extension surface, never from the host page. */
export function readCanvasChromeColors(canvas?: HTMLCanvasElement) {
  const style = canvas?.ownerDocument?.defaultView?.getComputedStyle(canvas);
  return {
    selection:
      style?.getPropertyValue('--sniptale-color-canvas-selection').trim() ||
      DEFAULT_COLOR_CANVAS_SELECTION,
    magnet:
      style?.getPropertyValue('--sniptale-color-canvas-magnet').trim() ||
      DEFAULT_COLOR_CANVAS_MAGNET,
  };
}

export function getCanvasHandleSize(kind: CanvasSelectionHandle) {
  const metrics = CANVAS_SELECTION_METRICS;
  return {
    width:
      kind === 'horizontal'
        ? metrics.sideLong
        : kind === 'vertical'
          ? metrics.sideShort
          : kind === 'point'
            ? metrics.point
            : metrics.corner,
    height:
      kind === 'horizontal'
        ? metrics.sideShort
        : kind === 'vertical'
          ? metrics.sideLong
          : kind === 'point'
            ? metrics.point
            : metrics.corner,
  };
}

/** Paint a fixed-size control. Hover changes only the pointer cursor. */
export function renderCanvasSelectionHandle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: CanvasSelectionHandle,
  options: { color?: string; active?: boolean; scale?: number } = {}
): void {
  const { width, height } = getCanvasHandleSize(kind);
  const color = options.color ?? DEFAULT_COLOR_CANVAS_SELECTION;
  const scale = options.scale ?? 1;
  context.save();
  context.translate(x, y);
  context.scale(1 / scale, 1 / scale);
  context.lineWidth = CANVAS_SELECTION_METRICS.border;
  context.strokeStyle = color;
  context.fillStyle = options.active ? color : '#ffffff';
  context.beginPath();
  if (kind === 'point') context.arc(0, 0, width / 2, 0, Math.PI * 2);
  else context.roundRect(-width / 2, -height / 2, width, height, kind === 'corner' ? 1.5 : 3);
  context.fill();
  context.stroke();
  context.restore();
}

/** The Tabler icon has no background, halo, hover animation or connecting stem. */
export function renderCanvasRotationHandle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  color = DEFAULT_COLOR_CANVAS_SELECTION,
  scale = 1
): void {
  context.save();
  context.translate(x, y);
  context.scale(
    CANVAS_SELECTION_METRICS.rotation / (24 * scale),
    CANVAS_SELECTION_METRICS.rotation / (24 * scale)
  );
  context.translate(-12, -12);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.arc(12, 12, 8, -Math.asin(1 / 8), Math.asin(3 / 8), true);
  context.moveTo(19.95, 20);
  context.lineTo(19.95, 15);
  context.lineTo(14.95, 15);
  context.moveTo(13, 12);
  context.arc(12, 12, 1, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}
