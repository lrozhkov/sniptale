import type { QuickEditRuntimeEventOptions } from './events.shared';
import {
  isQuickEditOwnedElement,
  isQuickEditStyleInspectableTarget,
  isQuickEditTextTarget,
  resolveQuickEditTarget,
} from './events.shared';

export function handleQuickEditOutsideClick(
  event: MouseEvent,
  options: QuickEditRuntimeEventOptions,
  elements: Iterable<HTMLElement>,
  iframe?: HTMLIFrameElement
): void {
  if (!options.isEnabled() || options.editingElementsSize() === 0) {
    return;
  }

  if (options.isDocumentModeEnabled()) {
    return;
  }

  const target = resolveQuickEditTarget(event, iframe);
  if (!target || isQuickEditOwnedElement(target)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  for (const element of elements) {
    options.finishEditing(element);
  }
}

export function handleQuickEditMouseLeave(options: QuickEditRuntimeEventOptions): void {
  if (!options.isEnabled()) {
    return;
  }
  options.hideHoverOverlay();
}

export function handleQuickEditMouseMove(
  event: MouseEvent,
  options: QuickEditRuntimeEventOptions,
  iframe?: HTMLIFrameElement
): void {
  if (!options.isEnabled()) {
    return;
  }

  if (options.isDocumentModeEnabled()) {
    options.hideHoverOverlay();
    return;
  }

  const target = resolveQuickEditTarget(event, iframe);
  if (!target) {
    options.hideHoverOverlay();
    return;
  }

  if (isQuickEditOwnedElement(target)) {
    options.hideHoverOverlay();
    return;
  }

  const isInspectableTarget = options.isStyleInspectorModeEnabled()
    ? isQuickEditStyleInspectableTarget(target)
    : isQuickEditTextTarget(target);

  if (isInspectableTarget) {
    options.showHoverOverlay(target);
  } else {
    options.hideHoverOverlay();
  }
}

export function handleQuickEditClick(
  event: MouseEvent,
  options: QuickEditRuntimeEventOptions,
  iframe?: HTMLIFrameElement
): void {
  if (!options.isEnabled()) {
    return;
  }

  if (options.isDocumentModeEnabled()) {
    return;
  }

  const target = resolveQuickEditTarget(event, iframe);
  if (!target || isQuickEditOwnedElement(target)) {
    return;
  }

  if (options.isStyleInspectorModeEnabled() && isQuickEditStyleInspectableTarget(target)) {
    event.preventDefault();
    event.stopPropagation();
    options.hideHoverOverlay();
    return;
  }

  if (isQuickEditTextTarget(target)) {
    event.preventDefault();
    event.stopPropagation();
    options.makeElementEditable(target);
    options.hideHoverOverlay();
  }
}

export function handleQuickEditBlur(
  event: FocusEvent,
  options: QuickEditRuntimeEventOptions,
  iframe?: HTMLIFrameElement
): void {
  if (!options.isEnabled()) {
    return;
  }

  const target = resolveQuickEditTarget(event, iframe);
  if (!target || !target.classList.contains('sniptale-editing')) {
    return;
  }

  setTimeout(() => {
    if (target.ownerDocument.activeElement !== target) {
      options.finishEditing(target);
    }
  }, 100);
}
