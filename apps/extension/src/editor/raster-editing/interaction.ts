import type { Canvas } from 'fabric';
import { sceneToRasterSource } from './coordinates';
import { hitRasterCrop, type RasterCropAction } from './crop';
import type { SourcePoint } from './contracts';
import type { RasterSession } from './session';
import { isRasterSourcePointVisible } from './selection';
import { rasterSelectionIcons, rasterToolIcons } from './tool-icons';

const KEYBOARD_UI_SELECTOR = [
  'input,textarea,select,[contenteditable="true"],[role="textbox"]',
  '[role="dialog"],[role="listbox"]',
  'button[aria-haspopup="listbox"][aria-expanded="true"]',
].join(',');

type SelectionOperation = 'new' | 'add' | 'subtract';
function iconCursor(body: string, operation: SelectionOperation = 'new') {
  const contact = '<path d="M7.5 2.5v10m-5-5h10" fill="none" stroke-linecap="square"/>';
  const badgePath = operation === 'add' ? 'M25 6h6m-3-3v6' : 'M25 6h6';
  const badge =
    operation === 'new'
      ? ''
      : '<circle cx="28" cy="6" r="5" fill="white"/>' +
        `<path d="${badgePath}" fill="none" stroke="#171717" ` +
        'stroke-width="1.5" stroke-linecap="round"/>';
  const halo = body
    .replaceAll('currentColor', 'white')
    .replaceAll('stroke-width="2"', 'stroke-width="4"');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">' +
    `<g stroke="white" stroke-width="3">${contact}</g>` +
    `<g stroke="#171717" stroke-width="1">${contact}</g>` +
    `<g transform="translate(12 12)" color="#171717">${halo}${body}</g>${badge}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 7 7, crosshair`;
}
const SELECTION_CURSORS = {
  rectangle: selectionCursors(rasterSelectionIcons.rectangle.body),
  lasso: selectionCursors(rasterSelectionIcons.lasso.body),
  wand: selectionCursors(rasterSelectionIcons.wand.body),
};
function selectionCursors(body: string) {
  return {
    new: iconCursor(body),
    add: iconCursor(body, 'add'),
    subtract: iconCursor(body, 'subtract'),
  };
}
const RASTER_CURSORS = {
  brush: 'none',
  fill: iconCursor(rasterToolIcons.fill.body),
  'remove-color': iconCursor(rasterToolIcons['remove-color'].body),
  erase: 'none',
  restore: 'none',
  crop: iconCursor(rasterToolIcons.crop.body),
};
const BLOCKED_CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" ' +
  'fill="none" stroke="#e03131" stroke-width="2">' +
  '<circle cx="14" cy="14" r="10"/><path d="M7 7l14 14"/></svg>';
const BLOCKED_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(BLOCKED_CURSOR_SVG)}") 14 14, not-allowed`;

function inputTarget(value: EventTarget | null): boolean {
  return value instanceof Element && value.closest(KEYBOARD_UI_SELECTOR) !== null;
}
/** Capture raster gestures before Fabric; ordinary tools, wheel and pan keep their existing owner. */
export function mountRasterInteraction(options: {
  canvas: Canvas;
  session: RasterSession;
  getMainTool?: () => string;
  isPanning?: () => boolean;
}) {
  const { canvas, session } = options,
    element = canvas.upperCanvasEl,
    window = element.ownerDocument.defaultView;
  let pointer: number | null = null,
    space = false,
    shift = false,
    control = false,
    lastPoint: SourcePoint | null = null,
    cursorOwned = false;
  let cropEnterHeld = false;
  const originalTabIndex = element.getAttribute('tabindex');
  function focusCanvas() {
    if (!element.hasAttribute('tabindex')) element.tabIndex = -1;
    element.focus({ preventScroll: true });
  }
  function active() {
    const state = session.getSnapshot();
    return (
      !!state.tool &&
      state.permission === 'allowed' &&
      !space &&
      !options.isPanning?.() &&
      (!options.getMainTool || options.getMainTool() === 'select')
    );
  }
  function source(event: PointerEvent): SourcePoint | null {
    const target = session.getTarget();
    if (!target) return null;
    const rect = element.getBoundingClientRect(),
      viewport = canvas.viewportTransform;
    const x = ((event.clientX - rect.left) * canvas.getWidth()) / rect.width,
      y = ((event.clientY - rect.top) * canvas.getHeight()) / rect.height;
    const determinant = viewport[0] * viewport[3] - viewport[1] * viewport[2];
    if (!Number.isFinite(determinant) || !determinant) return null;
    const scene = {
      x: (viewport[3] * (x - viewport[4]) - viewport[2] * (y - viewport[5])) / determinant,
      y: (viewport[0] * (y - viewport[5]) - viewport[1] * (x - viewport[4])) / determinant,
    };
    return sceneToRasterSource(target.geometry, scene);
  }
  function cropFrameAction(point: SourcePoint): RasterCropAction {
    const target = session.getTarget(),
      bounds = session.getCropBounds();
    if (!target || !bounds) return 'new';
    const [a, b, c, d] = target.geometry.sourceToScene;
    const [va, vb, vc, vd] = canvas.viewportTransform;
    const rect = element.getBoundingClientRect();
    const sx = rect.width / canvas.getWidth(),
      sy = rect.height / canvas.getHeight();
    return hitRasterCrop(bounds, point, {
      x: 6 / Math.max(0.0001, Math.hypot((va * a + vc * b) * sx, (vb * a + vd * b) * sy)),
      y: 6 / Math.max(0.0001, Math.hypot((va * c + vc * d) * sx, (vb * c + vd * d) * sy)),
    });
  }
  function cropCursor(point: SourcePoint) {
    const action = cropFrameAction(point);
    if (action === 'move') return 'move';
    if (action === 'new') return RASTER_CURSORS.crop;
    const target = session.getTarget()!;
    const [a, b, c, d] = target.geometry.sourceToScene;
    const [va, vb, vc, vd] = canvas.viewportTransform;
    const x = action.includes('w') ? -1 : action.includes('e') ? 1 : 0;
    const y = action.includes('n') ? -1 : action.includes('s') ? 1 : 0;
    const dx = a * x + c * y,
      dy = b * x + d * y;
    const angle = Math.atan2(vb * dx + vd * dy, va * dx + vc * dy);
    return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][
      ((Math.round(angle / (Math.PI / 4)) % 4) + 4) % 4
    ]!;
  }
  function editable(point: SourcePoint | null) {
    const target = session.getTarget();
    if (!point || !target) return false;
    const geometry =
      session.getSnapshot().tool === 'crop'
        ? {
            ...target.geometry,
            crop: { x: 0, y: 0, width: target.geometry.width, height: target.geometry.height },
          }
        : target.geometry;
    return (
      isRasterSourcePointVisible(geometry, point) ||
      (session.getSnapshot().tool === 'crop' && cropFrameAction(point) !== 'new')
    );
  }
  function clearCursor() {
    session.hideCursor();
    if (cursorOwned) {
      canvas.setCursor(canvas.defaultCursor);
      cursorOwned = false;
    }
  }
  function selectionOperation(): SelectionOperation {
    return shift ? 'add' : control ? 'subtract' : 'new';
  }
  function pointerModifiers(event: PointerEvent) {
    shift = event.shiftKey;
    control = event.ctrlKey;
  }
  function updateCursor(point: SourcePoint | null) {
    lastPoint = point;
    if (!active()) {
      clearCursor();
      return;
    }
    const state = session.getSnapshot();
    const allowed = editable(point);
    const toolCursor =
      state.tool === 'crop' && point
        ? cropCursor(point)
        : state.tool === 'select'
          ? SELECTION_CURSORS[state.selectionMethod][selectionOperation()]
          : state.tool
            ? RASTER_CURSORS[state.tool]
            : canvas.defaultCursor;
    canvas.setCursor(allowed ? toolCursor : BLOCKED_CURSOR);
    cursorOwned = true;
    if (point && allowed) session.moveCursor(point);
    else session.hideCursor();
  }
  function stop(event: Event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function release() {
    const id = pointer;
    pointer = null;
    if (id !== null && element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
  }
  function cancel() {
    if (pointer !== null) {
      release();
      session.cancel();
    }
  }
  function down(event: PointerEvent) {
    if (event.button !== 0 || !active()) return;
    pointerModifiers(event);
    const point = source(event);
    updateCursor(point);
    stop(event);
    if (!editable(point) || !point) return;
    const accepted =
      session.getSnapshot().tool === 'select'
        ? session.beginGesture(point, selectionOperation())
        : session.getSnapshot().tool === 'crop'
          ? session.beginGesture(point, undefined, cropFrameAction(point))
          : session.beginGesture(point);
    if (!accepted) return;
    if (session.getSnapshot().tool === 'crop') focusCanvas();
    pointer = event.pointerId;
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      /* A detached surface cannot retain capture. */
    }
  }
  function move(event: PointerEvent) {
    pointerModifiers(event);
    if (pointer !== event.pointerId) {
      updateCursor(source(event));
      if (active()) stop(event);
      return;
    }
    const point = source(event);
    updateCursor(point);
    if (point) session.moveGesture(point);
    stop(event);
  }
  function up(event: PointerEvent) {
    if (pointer !== event.pointerId) return;
    const point = source(event);
    release();
    if (point) void session.endGesture(point);
    else session.cancel();
    stop(event);
  }
  function lost(event: PointerEvent) {
    if (pointer === event.pointerId) cancel();
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && cropEnterHeld) {
      stop(event);
      return;
    }
    if (
      inputTarget(event.target) ||
      element.ownerDocument.querySelector('[data-floating-ui-root="true"][role="dialog"]')
    )
      return;
    shift = event.key === 'Shift' || event.shiftKey;
    control = event.key === 'Control' || event.ctrlKey;
    updateCursor(lastPoint);
    if (event.code === 'Space') {
      space = true;
      cancel();
      clearCursor();
      return;
    }
    if (!active()) return;
    if (
      session.getSnapshot().tool === 'crop' &&
      (event.key === 'Delete' ||
        event.key === 'Backspace' ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a'))
    ) {
      stop(event);
      return;
    }
    if (event.key === 'Enter' && session.getSnapshot().tool === 'crop') {
      cropEnterHeld = true;
      if (session.getSnapshot().cropPending && !session.getSnapshot().busy && pointer === null)
        void session.applyCrop();
      stop(event);
    } else if (event.key === 'Escape') {
      if (session.getSnapshot().tool === 'crop') session.cancelCrop();
      else session.cancel();
      stop(event);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      if (session.handlesDelete()) {
        void session.hideSelected();
        stop(event);
      }
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      session.selectAll();
      stop(event);
    }
  }
  function keyup(event: KeyboardEvent) {
    if (event.key === 'Enter' && cropEnterHeld) {
      cropEnterHeld = false;
      stop(event);
    }
    shift = event.key !== 'Shift' && event.shiftKey;
    control = event.key !== 'Control' && event.ctrlKey;
    if (event.code === 'Space') {
      space = false;
    }
    updateCursor(lastPoint);
  }
  function blur() {
    cropEnterHeld = false;
    space = false;
    shift = false;
    control = false;
    cancel();
    leave();
  }
  function leave() {
    lastPoint = null;
    clearCursor();
  }
  element.addEventListener('pointerdown', down, true);
  element.addEventListener('pointermove', move, true);
  element.addEventListener('pointerup', up, true);
  element.addEventListener('pointerleave', leave, true);
  element.addEventListener('pointercancel', lost, true);
  element.addEventListener('lostpointercapture', lost, true);
  window?.addEventListener('keydown', keydown, true);
  window?.addEventListener('keyup', keyup, true);
  window?.addEventListener('blur', blur);
  let previous = session.getSnapshot();
  const unsubscribe = session.subscribe(() => {
    const next = session.getSnapshot();
    if (
      previous.tool === 'crop' &&
      next.tool === null &&
      next.editing &&
      next.targetId === previous.targetId
    ) {
      const focused = element.ownerDocument.activeElement;
      if (
        focused === element ||
        focused === element.ownerDocument.body ||
        (focused instanceof Element && focused.closest('[data-ui^="editor.raster."]'))
      )
        focusCanvas();
    }
    previous = next;
    if (!next.tool) release();
    if (lastPoint) updateCursor(lastPoint);
    else clearCursor();
  });
  return {
    dispose() {
      cancel();
      clearCursor();
      unsubscribe();
      if (originalTabIndex === null && element.getAttribute('tabindex') === '-1')
        element.removeAttribute('tabindex');
      element.removeEventListener('pointerdown', down, true);
      element.removeEventListener('pointermove', move, true);
      element.removeEventListener('pointerup', up, true);
      element.removeEventListener('pointerleave', leave, true);
      element.removeEventListener('pointercancel', lost, true);
      element.removeEventListener('lostpointercapture', lost, true);
      window?.removeEventListener('keydown', keydown, true);
      window?.removeEventListener('keyup', keyup, true);
      window?.removeEventListener('blur', blur);
    },
  };
}
