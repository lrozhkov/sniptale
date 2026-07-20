const ACTIVATABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input[type="button"]:not([disabled])',
  'input[type="checkbox"]:not([disabled])',
  'input[type="radio"]:not([disabled])',
  'input[type="submit"]:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="menuitem"]:not([aria-disabled="true"])',
].join(',');

const BRIDGE_OPT_OUT_SELECTOR = [
  '[data-sniptale-activation-bridge="off"]',
  '.sniptale-drag-handle',
  '[data-ui="shared.ui.content-toolbar-drag-handle"]',
].join(',');

const EDITABLE_SELECTOR = [
  'input:not([type])',
  'input[type="email"]',
  'input[type="number"]',
  'input[type="password"]',
  'input[type="search"]',
  'input[type="tel"]',
  'input[type="text"]',
  'input[type="url"]',
  'select',
  'textarea',
  '[contenteditable]',
].join(',');

type ActivationBridgeMode = 'immediate' | 'defer';

type ActivationTarget = {
  element: Element;
  mode: ActivationBridgeMode;
};

export function getEventPath(event: Event): EventTarget[] {
  return typeof event.composedPath === 'function' ? event.composedPath() : [];
}

export function isPrimaryPointerEvent(event: Event): event is PointerEvent {
  if (typeof PointerEvent !== 'undefined' && event instanceof PointerEvent) {
    return event.button === 0 && !event.defaultPrevented;
  }

  return (
    event.type === 'pointerdown' &&
    'button' in event &&
    (event as MouseEvent).button === 0 &&
    !event.defaultPrevented
  );
}

function isEditableTarget(element: Element): boolean {
  return Boolean(element.closest(EDITABLE_SELECTOR));
}

function resolveActivationMode(element: Element): ActivationBridgeMode {
  return element.closest('[data-sniptale-activation-bridge="defer"]') ? 'defer' : 'immediate';
}

export function resolveActivationTarget(event: Event, root: EventTarget): ActivationTarget | null {
  for (const target of getEventPath(event)) {
    if (target === root) {
      return null;
    }
    if (!(target instanceof Element)) {
      continue;
    }
    if (target.closest(BRIDGE_OPT_OUT_SELECTOR) || isEditableTarget(target)) {
      return null;
    }
    if (target.matches(ACTIVATABLE_SELECTOR)) {
      return { element: target, mode: resolveActivationMode(target) };
    }
  }

  return null;
}

export function resolveEditableTarget(event: Event, root: EventTarget): HTMLElement | null {
  for (const target of getEventPath(event)) {
    if (target === root) {
      return null;
    }
    if (target instanceof HTMLElement) {
      const editableTarget = target.closest(EDITABLE_SELECTOR);
      if (editableTarget instanceof HTMLElement) {
        return editableTarget;
      }
    }
  }

  return null;
}
