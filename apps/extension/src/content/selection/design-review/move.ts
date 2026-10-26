import { readDesignReviewMoveCoordinates } from './move-coordinates';
import { setNavigationInputShieldSuspended } from '../locker';
import type { PageStyleMutationElement } from './style/types';
import {
  getContentEventTargetElement,
  isContentEventWithinElement,
  isContentOwnedEvent,
} from '../../platform/dom-host';
import {
  addWindowEventListenerToAllWindowsDynamic,
  getViewportClientPoint,
  mountStyleInAccessibleDocuments,
} from '../../platform/frame';
import { isTrustedPointerEvent, isTrustedMouseEvent } from '../../platform/trusted-events';

type Point = { x: number; y: number };
type Translation = { value: string | null; priority: '' | 'important' };

/** One native gesture owner for dragging the selected page element or its keyboard handle. */
interface MoveBindingOptions {
  target: PageStyleMutationElement;
  handle: HTMLElement;
  readPosition(): Point | null;
  apply(value: Translation, deferred: boolean): Promise<void>;
  finish(): void;
  onPosition(position: Point): void;
  onError(): void;
  onGestureChange?(active: boolean): void;
}

class ElementMoveGesture {
  constructor(private readonly args: MoveBindingOptions) {}
  private gesture:
    | (Point & {
        pointer: number;
        origin: Point;
        restore: Translation;
        page: boolean;
        coordinates: NonNullable<ReturnType<typeof readDesignReviewMoveCoordinates>>;
        last: Point;
        ownedStyle: Translation;
      })
    | null = null;
  private suppressClick = false;
  private readonly cursorClass = `sniptale-review-move-${crypto.randomUUID()}`;
  private cursorCleanup = () => {};
  cursor = (grabbing: boolean) => {
    this.cursorCleanup();
    this.cursorCleanup = mountStyleInAccessibleDocuments({
      styleId: 'sniptale-design-review-move-cursor',
      textContent: grabbing
        ? '*,*::before,*::after{cursor:grabbing!important}'
        : `.${this.cursorClass},.${this.cursorClass} *{cursor:grab!important}`,
    });
    this.args.onGestureChange?.(grabbing);
  };
  apply = (value: Translation, deferred: boolean) => {
    // The canonical style mutation writes synchronously; the promise settles its UI refresh.
    void this.args.apply(value, deferred).catch(() => {
      this.cancel();
      this.args.onError();
    });
  };
  readInlineTranslation = (): Translation => ({
    value: this.args.target.style.getPropertyValue('translate') || null,
    priority:
      this.args.target.style.getPropertyPriority('translate') === 'important' ? 'important' : '',
  });
  ownsTranslation = (origin: NonNullable<typeof this.gesture>): boolean => {
    const current = this.readInlineTranslation();
    return (
      current.value === origin.ownedStyle.value && current.priority === origin.ownedStyle.priority
    );
  };
  cancel = (): boolean => {
    const origin = this.gesture;
    if (!origin) return false;
    this.gesture = null;
    this.cursor(false);
    this.suppressClick = origin.page;
    const owned = this.ownsTranslation(origin);
    if (owned) {
      this.apply(origin.restore, true);
      this.args.onPosition({ x: origin.x, y: origin.y });
    }
    this.args.finish();
    if (!owned) this.args.onError();
    return true;
  };
  onPointerdown = (event: PointerEvent, _view: Window, iframe?: HTMLIFrameElement) => {
    if (!isTrustedPointerEvent(event)) return;
    this.suppressClick = false;
    const control = isContentEventWithinElement(event, this.args.handle);
    const target = getContentEventTargetElement(event);
    const page =
      !isContentOwnedEvent(event) && Boolean(target && this.args.target.contains(target));
    if ((!control && !page) || event.button !== 0 || event.isPrimary === false || this.gesture)
      return;
    const position = this.args.readPosition();
    const coordinates = readDesignReviewMoveCoordinates(this.args.target);
    if (!position || !coordinates || !this.args.target.isConnected) {
      this.args.onError();
      return;
    }
    this.args.finish();
    this.gesture = {
      ...position,
      last: position,
      ownedStyle: this.readInlineTranslation(),
      coordinates,
      origin: getViewportClientPoint(event.clientX, event.clientY, iframe),
      pointer: event.pointerId,
      page,
      restore: {
        value: this.args.target.style.getPropertyValue('translate') || null,
        priority:
          this.args.target.style.getPropertyPriority('translate') === 'important'
            ? 'important'
            : '',
      },
    };
    this.cursor(true);
    this.args.handle.focus({ preventScroll: true });
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  onPointermove = (event: PointerEvent, _view: Window, iframe?: HTMLIFrameElement) => {
    const origin = this.gesture;
    if (!origin || event.pointerId !== origin.pointer || !isTrustedPointerEvent(event)) return;
    if (!this.args.target.isConnected) {
      this.cancel();
      return;
    }
    const current = this.args.readPosition();
    if (
      !origin.coordinates.matches(readDesignReviewMoveCoordinates(this.args.target)) ||
      !current ||
      Math.abs(current.x - origin.last.x) > 0.05 ||
      Math.abs(current.y - origin.last.y) > 0.05
    ) {
      this.cancel();
      return;
    }
    const point = getViewportClientPoint(event.clientX, event.clientY, iframe);
    const delta = origin.coordinates.toLocal({
      x: point.x - origin.origin.x,
      y: point.y - origin.origin.y,
    });
    const position = {
      x: Math.round((origin.x + delta.x) * 10) / 10,
      y: Math.round((origin.y + delta.y) * 10) / 10,
    };
    if (position.x === origin.last.x && position.y === origin.last.y) return;
    origin.last = position;
    this.apply({ value: `${position.x}px ${position.y}px`, priority: '' }, true);
    origin.ownedStyle = this.readInlineTranslation();
    this.args.onPosition(position);
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  onPointerup = (event: PointerEvent) => {
    if (!this.gesture || event.pointerId !== this.gesture.pointer || !isTrustedPointerEvent(event))
      return;
    if (
      !this.ownsTranslation(this.gesture) ||
      !this.gesture.coordinates.matches(readDesignReviewMoveCoordinates(this.args.target))
    ) {
      this.cancel();
      return;
    }
    this.suppressClick = this.gesture.page;
    this.gesture = null;
    this.cursor(false);
    this.args.finish();
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  onPointercancel = (event: PointerEvent) => {
    if (event.pointerId === this.gesture?.pointer && isTrustedPointerEvent(event)) this.cancel();
  };
  onClick = (event: MouseEvent) => {
    if (!this.suppressClick || !isTrustedMouseEvent(event) || isContentOwnedEvent(event)) return;
    this.suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  onBlur = (event: Event, view: Window) => {
    if (event.target === view) this.cancel();
  };
  onScroll = () => this.cancel();
  start() {
    this.args.target.classList.add(this.cursorClass);
    this.cursor(false);
  }

  dispose() {
    this.cancel();
    this.cursorCleanup();
    this.args.target.classList.remove(this.cursorClass);
  }
}

/** One native gesture owner for dragging the selected page element or its keyboard handle. */
export function bindDesignReviewElementMove(args: MoveBindingOptions) {
  setNavigationInputShieldSuspended(true);
  const session = new ElementMoveGesture(args);
  session.start();
  const cleanups = [
    addWindowEventListenerToAllWindowsDynamic<PointerEvent>('pointerdown', session.onPointerdown, {
      capture: true,
    }),
    addWindowEventListenerToAllWindowsDynamic<PointerEvent>('pointermove', session.onPointermove, {
      capture: true,
    }),
    addWindowEventListenerToAllWindowsDynamic<PointerEvent>('pointerup', session.onPointerup, {
      capture: true,
    }),
    addWindowEventListenerToAllWindowsDynamic<PointerEvent>(
      'pointercancel',
      session.onPointercancel,
      { capture: true }
    ),
    addWindowEventListenerToAllWindowsDynamic<MouseEvent>('click', session.onClick, {
      capture: true,
    }),
    addWindowEventListenerToAllWindowsDynamic<Event>('blur', session.onBlur, { capture: true }),
    addWindowEventListenerToAllWindowsDynamic('scroll', session.onScroll, { capture: true }),
  ];
  return {
    cancel: session.cancel,
    dispose() {
      session.cancel();
      cleanups.forEach((cleanup) => cleanup());
      session.dispose();
      setNavigationInputShieldSuspended(false);
    },
  };
}
