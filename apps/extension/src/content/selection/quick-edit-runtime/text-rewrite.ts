import {
  addWindowEventListenerToAllWindowsDynamic,
  getViewportClientPoint,
  mountStyleInAccessibleDocuments,
} from '../../platform/frame';
import { isContentOwnedEvent } from '../../platform/dom-host';
import { isTrustedKeyboardEvent, isTrustedMouseEvent } from '../../platform/trusted-events';
import { resolveQuickEditTextTarget } from './target';
import { canEditQuickEditTarget } from './target-session';
import { createQuickEditHistoryTracker } from './history';
import { createQuickEditOverlayActions } from './overlays';
import { createQuickEditOverlayState } from './overlay.state';

export interface QuickEditTextReplacementTarget {
  readonly element: HTMLElement;
  readonly text: string;
  readonly anchor: { x: number; y: number };
  isCurrent(): boolean;
  apply(text: string): boolean;
}

function belongsToCurrentPage(element: HTMLElement): boolean {
  let current = element.ownerDocument;
  try {
    while (current !== document) {
      const frame = current.defaultView?.frameElement;
      if (!frame?.isConnected || Reflect.get(frame, 'contentDocument') !== current) return false;
      current = frame.ownerDocument;
    }
    return true;
  } catch {
    return false;
  }
}

/** Captures one source and applies a replacement through the canonical QuickEdit transaction. */
export function createQuickEditTextReplacementTarget(
  element: HTMLElement,
  anchor: { x: number; y: number }
): QuickEditTextReplacementTarget | null {
  if (!belongsToCurrentPage(element) || !canEditQuickEditTarget(element)) return null;
  const text = element.textContent ?? '';
  const markup = element.innerHTML;
  let applied = false;
  const isCurrent = () =>
    !applied &&
    belongsToCurrentPage(element) &&
    canEditQuickEditTarget(element) &&
    element.textContent === text &&
    element.innerHTML === markup;
  return {
    element,
    text,
    anchor: { ...anchor },
    isCurrent,
    apply(replacement) {
      if (!isCurrent()) return false;
      if (replacement === text) {
        applied = true;
        return true;
      }
      const tracker = createQuickEditHistoryTracker();
      const id = `text-replacement:${crypto.randomUUID()}`;
      tracker.begin(element, id);
      try {
        element.textContent = replacement;
        if (!tracker.commit(element, id)) throw new Error('Text replacement commit was refused');
        applied = true;
        return true;
      } catch (error) {
        tracker.cancel(id);
        throw error;
      }
    },
  };
}

/** Owns the text picker projection and window capture listeners in accessible page frames. */
export function startQuickEditTextPicker(args: {
  onSelect(target: QuickEditTextReplacementTarget): void;
  onFinish(): void;
}) {
  const overlays = createQuickEditOverlayActions(createQuickEditOverlayState());
  let selected: HTMLElement | null = null;
  const cleanups: Array<() => void> = [
    mountStyleInAccessibleDocuments({
      styleId: 'sniptale-text-replacement-picker',
      textContent: 'body,body *{cursor:crosshair!important}',
    }),
  ];
  const claim = (event: Event, prevent = false) => {
    if (prevent) event.preventDefault();
    event.stopImmediatePropagation();
  };
  for (const type of ['pointerdown', 'mousedown'])
    cleanups.push(
      addWindowEventListenerToAllWindowsDynamic(
        type,
        (event) => {
          if (!isContentOwnedEvent(event)) claim(event, type === 'mousedown');
        },
        { capture: true }
      )
    );
  cleanups.push(
    addWindowEventListenerToAllWindowsDynamic<MouseEvent>(
      'mousemove',
      (event, _view, iframe) => {
        if (!isTrustedMouseEvent(event) || isContentOwnedEvent(event)) return;
        claim(event);
        const target = selected?.isConnected ? selected : resolveQuickEditTextTarget(event, iframe);
        if (target) overlays.showHoverOverlay(target);
        else overlays.hideHoverOverlay();
      },
      { capture: true }
    ),
    addWindowEventListenerToAllWindowsDynamic<MouseEvent>(
      'click',
      (event, _view, iframe) => {
        if (isContentOwnedEvent(event)) return;
        claim(event, true);
        if (!isTrustedMouseEvent(event) || event.button !== 0) return;
        const element = resolveQuickEditTextTarget(event, iframe);
        if (!element) return;
        const target = createQuickEditTextReplacementTarget(
          element,
          getViewportClientPoint(event.clientX, event.clientY, iframe)
        );
        if (target) args.onSelect(target);
      },
      { capture: true }
    ),
    addWindowEventListenerToAllWindowsDynamic<KeyboardEvent>(
      'keydown',
      (event) => {
        if (!isTrustedKeyboardEvent(event) || isContentOwnedEvent(event) || event.key !== 'Escape')
          return;
        claim(event, true);
        args.onFinish();
      },
      { capture: true }
    )
  );
  return {
    setSelectedTarget(element: HTMLElement | null) {
      selected = element;
      if (element?.isConnected) overlays.showHoverOverlay(element);
      else overlays.hideHoverOverlay();
    },
    dispose() {
      cleanups.splice(0).forEach((cleanup) => cleanup());
      overlays.removeHoverOverlay();
    },
  };
}
