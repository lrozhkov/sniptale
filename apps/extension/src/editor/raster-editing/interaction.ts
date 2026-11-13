import type { Canvas } from 'fabric';
import { sceneToRasterSource } from './coordinates';
import type { SourcePoint } from './contracts';
import type { RasterSession } from './session';

const KEYBOARD_UI_SELECTOR = [
  'input,textarea,select,[contenteditable="true"],[role="textbox"]',
  '[role="dialog"],[role="listbox"]',
  'button[aria-haspopup="listbox"][aria-expanded="true"]',
].join(',');

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
    space = false;
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
    const point = source(event);
    if (!point || !session.beginGesture(point)) return;
    pointer = event.pointerId;
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      /* A detached surface cannot retain capture. */
    }
    stop(event);
  }
  function move(event: PointerEvent) {
    if (pointer !== event.pointerId) {
      if (active()) {
        const point = source(event);
        if (point) session.moveCursor(point);
      }
      return;
    }
    const point = source(event);
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
    if (inputTarget(event.target)) return;
    if (event.code === 'Space') {
      space = true;
      cancel();
      return;
    }
    if (!active()) return;
    if (event.key === 'Escape') {
      session.cancel();
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
    if (event.code === 'Space') space = false;
  }
  function blur() {
    space = false;
    cancel();
  }
  element.addEventListener('pointerdown', down, true);
  element.addEventListener('pointermove', move, true);
  element.addEventListener('pointerup', up, true);
  element.addEventListener('pointercancel', lost, true);
  element.addEventListener('lostpointercapture', lost, true);
  window?.addEventListener('keydown', keydown, true);
  window?.addEventListener('keyup', keyup, true);
  window?.addEventListener('blur', blur);
  const unsubscribe = session.subscribe(() => {
    if (!session.getSnapshot().tool) release();
  });
  return {
    dispose() {
      cancel();
      unsubscribe();
      element.removeEventListener('pointerdown', down, true);
      element.removeEventListener('pointermove', move, true);
      element.removeEventListener('pointerup', up, true);
      element.removeEventListener('pointercancel', lost, true);
      element.removeEventListener('lostpointercapture', lost, true);
      window?.removeEventListener('keydown', keydown, true);
      window?.removeEventListener('keyup', keyup, true);
      window?.removeEventListener('blur', blur);
    },
  };
}
