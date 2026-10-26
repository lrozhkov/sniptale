import type { PageCorner } from '../../../contracts/page-launch';
import {
  clampCornerDragPosition,
  nearestPageCorner,
  nextPageCorner,
  pageCornerForKey,
  type CornerPoint,
} from './geometry';
export interface CornerGroupDragState {
  draft: (CornerPoint & { corner: PageCorner }) | null;
  pending: boolean;
  dragging: boolean;
}
interface CornerGroupDragOptions {
  group: HTMLElement;
  handle: HTMLElement;
  getCorner(): PageCorner;
  onCommit(corner: PageCorner, event: Event): Promise<void>;
  onState(state: CornerGroupDragState): void;
  onError(error: unknown): void;
}
interface PointerDrag {
  id: number;
  start: CornerPoint;
  offset: CornerPoint;
  width: number;
  height: number;
  moved: boolean;
}

class CornerGroupDragController {
  private drag: PointerDrag | null = null;
  private state: CornerGroupDragState = { draft: null, pending: false, dragging: false };
  private disposed = false;
  private readonly target: Window;
  private corner: PageCorner;
  constructor(private readonly options: CornerGroupDragOptions) {
    const target = options.handle.ownerDocument.defaultView;
    if (!target) throw new Error('Corner group window is unavailable');
    this.target = target;
    this.corner = options.getCorner();
  }
  start() {
    const handle = this.options.handle;
    handle.addEventListener('pointerdown', this.down);
    handle.addEventListener('pointermove', this.move);
    handle.addEventListener('pointerup', this.up);
    handle.addEventListener('pointercancel', this.cancel);
    handle.addEventListener('lostpointercapture', this.lost);
    handle.addEventListener('keydown', this.key);
    handle.addEventListener('click', this.click);
    this.target.addEventListener('keydown', this.escape, true);
    this.target.addEventListener('blur', this.cancel);
    this.target.addEventListener('resize', this.cancel);
    this.emit();
  }
  private viewport() {
    return {
      width: this.options.group.ownerDocument.documentElement.clientWidth || this.target.innerWidth,
      height: this.target.innerHeight,
    };
  }
  private emit() {
    if (!this.disposed) this.options.onState({ ...this.state });
  }
  private release() {
    const drag = this.drag;
    this.drag = null;
    this.state.dragging = false;
    if (drag && this.options.handle.hasPointerCapture(drag.id))
      this.options.handle.releasePointerCapture(drag.id);
  }
  private down = (event: PointerEvent) => {
    if (event.button !== 0 || this.drag || this.state.pending || this.disposed) return;
    const bounds = this.options.group.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();
    this.options.handle.setPointerCapture(event.pointerId);
    this.drag = {
      id: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      offset: { x: event.clientX - bounds.x, y: event.clientY - bounds.y },
      width: bounds.width,
      height: bounds.height,
      moved: false,
    };
    this.state.dragging = true;
    this.emit();
  };
  private move = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) < 4)
      return;
    event.preventDefault();
    event.stopPropagation();
    drag.moved = true;
    const viewport = this.viewport();
    this.state.draft = {
      ...clampCornerDragPosition(
        { x: event.clientX - drag.offset.x, y: event.clientY - drag.offset.y },
        drag,
        viewport
      ),
      corner: nearestPageCorner({ x: event.clientX, y: event.clientY }, viewport),
    };
    this.emit();
  };
  private up = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const moved = drag.moved;
    this.release();
    if (moved)
      void this.commit(
        nearestPageCorner({ x: event.clientX, y: event.clientY }, this.viewport()),
        event
      );
    else this.cancel();
  };
  private async commit(corner: PageCorner, event: Event) {
    if (this.state.pending || this.disposed) return;
    this.state.pending = true;
    this.emit();
    try {
      await this.options.onCommit(corner, event);
    } catch (error) {
      if (!this.disposed) this.options.onError(error);
    } finally {
      this.state = { draft: null, pending: false, dragging: false };
      this.corner = this.options.getCorner();
      this.emit();
    }
  }
  private key = (event: KeyboardEvent) => {
    if (this.drag || this.state.pending || event.altKey || event.ctrlKey || event.metaKey) return;
    const corner = pageCornerForKey(this.options.getCorner(), event.key);
    if (!corner) return;
    event.preventDefault();
    event.stopPropagation();
    void this.commit(corner, event);
  };
  private click = (event: MouseEvent) => {
    if (event.detail !== 0 || this.drag || this.state.pending) return;
    event.preventDefault();
    event.stopPropagation();
    void this.commit(nextPageCorner(this.options.getCorner()), event);
  };
  private escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.drag) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancel();
  };
  private lost = (event: PointerEvent) => {
    if (this.drag?.id === event.pointerId) this.cancel();
  };
  private cancel = () => {
    this.release();
    this.state = { ...this.state, draft: null };
    this.emit();
  };
  refresh = () => {
    if (this.corner === this.options.getCorner()) return;
    this.corner = this.options.getCorner();
    this.cancel();
  };
  dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.release();
    const handle = this.options.handle;
    handle.removeEventListener('pointerdown', this.down);
    handle.removeEventListener('pointermove', this.move);
    handle.removeEventListener('pointerup', this.up);
    handle.removeEventListener('pointercancel', this.cancel);
    handle.removeEventListener('lostpointercapture', this.lost);
    handle.removeEventListener('keydown', this.key);
    handle.removeEventListener('click', this.click);
    this.target.removeEventListener('keydown', this.escape, true);
    this.target.removeEventListener('blur', this.cancel);
    this.target.removeEventListener('resize', this.cancel);
  };
}

/** One document-local pointer lifecycle shared by shim and full toolbar corner groups. */
export function installCornerGroupDrag(options: CornerGroupDragOptions) {
  const controller = new CornerGroupDragController(options);
  controller.start();
  return { dispose: controller.dispose, refresh: controller.refresh };
}
