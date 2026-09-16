import { resolveTourCamera } from './camera.js';
import { bindTourObjectDrag } from './authoring.js';
import { bindTourRectResize } from './authoring-rect.js';

/** Camera frame uses base-stage coordinates, including letterboxing, rather than clipped source bounds. */
export function renderTourCameraFrame(
  slide,
  viewport,
  imageBox,
  { element, labels, authoring, signal }
) {
  const target = resolveTourCamera(slide, viewport, false);
  if (!target) return null;
  const rect = frameForProjection(target, imageBox, viewport);
  const stageBox = { x: 0, y: 0, width: viewport.stageWidth, height: viewport.stageHeight };
  const constrainRect = (next) => {
    const camera = cameraForFrame(next, imageBox, viewport);
    const projected = resolveTourCamera(
      { ...slide, camera: { ...slide.camera, ...camera, mode: 'manual' } },
      viewport,
      false
    );
    return frameForProjection(projected, imageBox, viewport);
  };
  const frame = element('div', 'tour-mask tour-camera-frame');
  frame.tabIndex = 0;
  frame.setAttribute('role', 'group');
  frame.setAttribute('aria-label', labels.resize ?? labels.details);
  frame.dataset.selected = 'true';
  Object.assign(frame.style, {
    left: `${rect.x * stageBox.width}px`,
    top: `${rect.y * stageBox.height}px`,
    width: `${rect.width * stageBox.width}px`,
    height: `${rect.height * stageBox.height}px`,
    pointerEvents: 'auto',
  });
  const change = (next) => authoring.onFrameCamera?.(cameraForFrame(next, imageBox, viewport));
  frame.addEventListener('keydown', (event) => {
    if (
      event.target !== frame ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (signal.aborted || authoring.canEdit?.() === false) return;
    const step = event.shiftKey ? 10 : 1;
    const dx =
      (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0) / stageBox.width;
    const dy =
      (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) / stageBox.height;
    change(constrainRect({ ...rect, x: rect.x + dx, y: rect.y + dy }));
  });
  const callbacks = {
    canEdit: authoring.canEdit,
    onSelectObject: () => {},
    onMoveObject: (_id, point) => change({ ...rect, ...point }),
    onResizeObject: (_id, next) => change(next),
  };
  bindTourObjectDrag(
    frame,
    {
      id: 'camera-frame',
      point: rect,
      maxX: 1 - rect.width,
      maxY: 1 - rect.height,
      constrainPoint: (point) => {
        const next = constrainRect({ ...rect, ...point });
        return { x: next.x, y: next.y };
      },
    },
    stageBox,
    callbacks,
    signal
  );
  bindTourRectResize(
    frame,
    { id: 'camera-frame', rect, aspect: 1, constrainRect },
    stageBox,
    callbacks,
    signal,
    labels.resize ?? labels.details
  );
  delete frame.dataset.tourObjectId;
  return frame;
}

function frameForProjection(target, base, viewport) {
  const scale = base.width / target.width;
  return {
    x: (base.x - target.x * scale) / viewport.stageWidth,
    y: (base.y - target.y * scale) / viewport.stageHeight,
    width: scale,
    height: scale,
  };
}
function cameraForFrame(rect, base, viewport) {
  const clamp = (value) => Math.max(0, Math.min(1, value));
  return {
    center: {
      x: clamp(((rect.x + rect.width / 2) * viewport.stageWidth - base.x) / base.width),
      y: clamp(((rect.y + rect.height / 2) * viewport.stageHeight - base.y) / base.height),
    },
    zoom: Math.max(1, Math.min(8, 1 / rect.width)),
  };
}
