import type { PointerEvent } from 'react';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';
import type { QuickEditCameraTransform } from '../../features/video/review/advanced/types';
import { focusCorner } from './focus-area-frame';

type Center = { centerX: number; centerY: number };
type CameraPointerProps = {
  camera: QuickEditCameraTransform;
  videoRect: QuickEditRect;
  visibleArea?: QuickEditRect;
  /** Unclipped normalized output viewport; independent of the displayed footprint. */
  viewport?: QuickEditRect;
  output: { width: number; height: number };
  view: 'area' | 'result';
};

function cameraPointerPoint(
  event: PointerEvent<HTMLElement>,
  bounds: DOMRect,
  output: { width: number; height: number },
  video: QuickEditRect
): Center {
  return {
    centerX:
      (((event.clientX - bounds.left) * output.width) / bounds.width - video.x) / video.width,
    centerY:
      (((event.clientY - bounds.top) * output.height) / bounds.height - video.y) / video.height,
  };
}

/** Capture the visible crop origin and pointer scale once, including click-to-place in Area mode. */
export function captureCameraPointer(
  props: CameraPointerProps,
  event: PointerEvent<HTMLElement>,
  bounds: DOMRect
) {
  const corner = props.view === 'area' ? focusCorner(event.target) : null;
  const result = props.view === 'result';
  const factor = result ? props.camera.scale : 1;
  const limit = 0.5 / props.camera.scale;
  const visible = {
    centerX: Math.max(limit, Math.min(1 - limit, props.camera.centerX)),
    centerY: Math.max(limit, Math.min(1 - limit, props.camera.centerY)),
  };
  const point = cameraPointerPoint(event, bounds, props.output, props.videoRect);
  const area = props.visibleArea ?? {
    x: visible.centerX - limit,
    y: visible.centerY - limit,
    width: limit * 2,
    height: limit * 2,
  };
  const place =
    !result &&
    !corner &&
    (point.centerX < area.x ||
      point.centerX > area.x + area.width ||
      point.centerY < area.y ||
      point.centerY > area.y + area.height);
  return {
    corner,
    viewport: props.viewport ?? { x: 0, y: 0, width: 1, height: 1 },
    scale: props.camera.scale,
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    width: (props.videoRect.width * factor * bounds.width) / props.output.width,
    height: (props.videoRect.height * factor * bounds.height) / props.output.height,
    origin: place ? point : visible,
    pending: place ? point : null,
    direction: result ? -1 : 1,
  };
}

/** Resize the captured raw crop, retaining its opposite corner before source-bound clamping. */
export function resizeCameraPointer(
  active: ReturnType<typeof captureCameraPointer>,
  dx: number,
  dy: number
) {
  const corner = active.corner!;
  const viewport = active.viewport;
  const raw = {
    x: active.origin.centerX + (viewport.x - 0.5) / active.scale,
    y: active.origin.centerY + (viewport.y - 0.5) / active.scale,
    width: viewport.width / active.scale,
    height: viewport.height / active.scale,
  };
  const west = corner.endsWith('w'),
    north = corner.startsWith('n');
  const rx = 1 + (west ? -dx : dx) / raw.width;
  const ry = 1 + (north ? -dy : dy) / raw.height;
  const ratio = Math.abs(rx - 1) >= Math.abs(ry - 1) ? rx : ry;
  const scale = Math.max(1, Math.min(4, active.scale / Math.max(0.001, ratio)));
  const x = west ? raw.x + raw.width - viewport.width / scale : raw.x;
  const y = north ? raw.y + raw.height - viewport.height / scale : raw.y;
  const limit = 0.5 / scale;
  const bound = (value: number) => Math.max(limit, Math.min(1 - limit, value));
  return {
    scale,
    centerX: bound(x - (viewport.x - 0.5) / scale),
    centerY: bound(y - (viewport.y - 0.5) / scale),
  };
}
