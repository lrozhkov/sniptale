import { isContentOwnedElement, queryContentUiElement } from '../../platform/dom-host';
import {
  addEventListenerToAllWindowsDynamic,
  addWindowEventListenerToAllWindowsDynamic,
  getAbsolutePosition,
  getViewportClientPoint,
} from '../../platform/frame';
import { resolvePagePreparationElement } from '../../parser/page-preparation/target';
import { isTrustedKeyboardEvent, isTrustedMouseEvent } from '../../platform/trusted-events';
import { mountDesignReviewCursor } from './cursor';
import { hideDesignReviewFrame, removeDesignReviewFrame, showDesignReviewFrame } from './frame';
import { addInaccessibleIframeSelectionListener } from './inaccessible-iframe';
import { readPageStyleSelectionSnapshot, type PageStyleSelectionSnapshot } from './snapshot';

export interface DesignReviewSelection {
  anchor: { x: number; y: number };
  snapshot: PageStyleSelectionSnapshot;
}

export interface DesignReviewPickerRuntime {
  dispose: () => void;
  selectElement: (element: Element) => boolean;
}

function isElementNode(value: unknown): value is Element {
  return (
    typeof value === 'object' &&
    value !== null &&
    Reflect.get(value, 'nodeType') === Node.ELEMENT_NODE
  );
}

function getAssociatedLabels(element: Element): Element[] {
  const labels: unknown = Reflect.get(element, 'labels');
  if (typeof labels !== 'object' || labels === null) return [];
  const length: unknown = Reflect.get(labels, 'length');
  if (typeof length !== 'number' || !Number.isInteger(length) || length < 0) return [];

  const result: Element[] = [];
  for (let index = 0; index < length; index += 1) {
    const label: unknown = Reflect.get(labels, String(index));
    if (isElementNode(label)) result.push(label);
  }
  return result;
}

function resolveSelectableSnapshot(element: Element): PageStyleSelectionSnapshot | null {
  const candidates: Element[] = [element, ...getAssociatedLabels(element)];
  let ancestor = element.parentElement;
  while (ancestor) {
    candidates.push(ancestor);
    ancestor = ancestor.parentElement;
  }

  const visited = new Set<Element>();
  for (const candidate of candidates) {
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    const snapshot = readPageStyleSelectionSnapshot(candidate);
    if (snapshot) return snapshot;
  }
  return null;
}

function resolveComposedPageElement(event: MouseEvent, iframe?: HTMLIFrameElement): Element | null {
  const composedTargets = event
    .composedPath()
    .filter(
      (candidate): candidate is Element =>
        typeof candidate === 'object' &&
        'nodeType' in candidate &&
        candidate.nodeType === Node.ELEMENT_NODE
    );
  if (composedTargets.some((candidate) => isContentOwnedElement(candidate))) {
    return null;
  }

  const resolved = composedTargets[0] ?? resolvePagePreparationElement(event, iframe);
  return resolved && !isContentOwnedElement(resolved) ? resolved : null;
}

function resolveSelection(
  event: MouseEvent,
  iframe?: HTMLIFrameElement
): DesignReviewSelection | null {
  const element = resolveComposedPageElement(event, iframe);
  const snapshot = element ? resolveSelectableSnapshot(element) : null;
  if (!snapshot) {
    return null;
  }

  return {
    anchor: getViewportClientPoint(event.clientX, event.clientY, iframe),
    snapshot,
  };
}

function resolveElementSelection(element: Element): DesignReviewSelection | null {
  const snapshot = resolveSelectableSnapshot(element);
  if (!snapshot) {
    return null;
  }
  const rect = getAbsolutePosition(snapshot.element);
  const trailingAnchorOffset = Math.max(Math.min(rect.width, 24), rect.width - 24);
  return {
    anchor: {
      x: rect.x + trailingAnchorOffset,
      y: rect.y + Math.min(rect.height, 24),
    },
    snapshot,
  };
}

/** Owns trusted page picking for the active Design Review mode. */
export function startDesignReviewPicker(args: {
  onDisableRequested: () => void;
  onSelection: (selection: DesignReviewSelection) => void;
}): DesignReviewPickerRuntime {
  let selectedElement: Element | null = null;
  let framedElement: Element | null = null;
  const cleanupCursor = mountDesignReviewCursor();

  function refreshFrame(): void {
    if (framedElement?.isConnected) {
      showDesignReviewFrame(framedElement);
    } else {
      hideDesignReviewFrame();
    }
  }

  function selectElement(element: Element): boolean {
    const selection = resolveElementSelection(element);
    if (!selection) {
      return false;
    }
    selectedElement = element;
    framedElement = element;
    refreshFrame();
    args.onSelection(selection);
    return true;
  }

  const cleanupMove = addEventListenerToAllWindowsDynamic<MouseEvent>(
    'mousemove',
    (event, iframe) => {
      if (!isTrustedMouseEvent(event)) {
        return;
      }
      const selection = resolveSelection(event, iframe);
      if (selection) {
        framedElement = selection.snapshot.element;
        refreshFrame();
      } else if (selectedElement) {
        framedElement = selectedElement;
        refreshFrame();
      } else {
        framedElement = null;
        hideDesignReviewFrame();
      }
    },
    { capture: true }
  );
  const cleanupLeave = addEventListenerToAllWindowsDynamic<MouseEvent>(
    'mouseleave',
    () => {
      if (selectedElement) {
        framedElement = selectedElement;
        refreshFrame();
      } else {
        framedElement = null;
        hideDesignReviewFrame();
      }
    },
    { capture: true }
  );
  const cleanupClick = addEventListenerToAllWindowsDynamic<MouseEvent>(
    'click',
    (event, iframe) => {
      if (!isTrustedMouseEvent(event)) {
        return;
      }
      const selection = resolveSelection(event, iframe);
      if (!selection) {
        return;
      }

      selectedElement = selection.snapshot.element;
      framedElement = selectedElement;
      refreshFrame();
      args.onSelection(selection);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    },
    { capture: true }
  );
  const cleanupScroll = addEventListenerToAllWindowsDynamic<Event>('scroll', refreshFrame, {
    capture: true,
  });
  const cleanupResize = addWindowEventListenerToAllWindowsDynamic<Event>('resize', refreshFrame);
  const cleanupKeydown = addEventListenerToAllWindowsDynamic<KeyboardEvent>(
    'keydown',
    (event) => {
      if (!isTrustedKeyboardEvent(event) || event.key !== 'Escape') {
        return;
      }
      if (
        queryContentUiElement(
          [
            '[data-ui="content.design-review.feedback-panel"]',
            '[data-ui="content.design-review.action-menu"]',
          ].join(',')
        )
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      args.onDisableRequested();
    },
    { capture: true }
  );
  const cleanupInaccessibleIframes = addInaccessibleIframeSelectionListener((iframe) => {
    selectElement(iframe);
  });

  return {
    dispose: () => {
      cleanupMove();
      cleanupLeave();
      cleanupClick();
      cleanupKeydown();
      cleanupScroll();
      cleanupResize();
      cleanupInaccessibleIframes();
      cleanupCursor();
      removeDesignReviewFrame();
    },
    selectElement,
  };
}
