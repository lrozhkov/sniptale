import { isContentOwnedElement } from '../../platform/dom-host';
import {
  addEventListenerToAllWindowsDynamic,
  addWindowEventListenerToAllWindowsDynamic,
  getAbsolutePosition,
  getViewportClientPoint,
} from '../../platform/frame';
import { resolvePagePreparationElement } from '../../parser/page-preparation/target';
import { isTrustedKeyboardEvent, isTrustedMouseEvent } from '../../platform/trusted-events';
import { hideDesignReviewFrame, removeDesignReviewFrame, showDesignReviewFrame } from './frame';
import { addInaccessibleIframeSelectionListener } from './inaccessible-iframe';
import { readPageStyleSelectionSnapshot, type PageStyleSelectionSnapshot } from './snapshot';

export interface DesignReviewSelection {
  anchor: { x: number; y: number };
  snapshot: PageStyleSelectionSnapshot;
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
  const snapshot = element ? readPageStyleSelectionSnapshot(element) : null;
  if (!snapshot) {
    return null;
  }

  return {
    anchor: getViewportClientPoint(event.clientX, event.clientY, iframe),
    snapshot,
  };
}

/** Owns trusted page picking for the active Design Review mode. */
export function startDesignReviewPicker(args: {
  onDisableRequested: () => void;
  onSelection: (selection: DesignReviewSelection) => void;
}): () => void {
  let selectedElement: Element | null = null;
  let framedElement: Element | null = null;

  function refreshFrame(): void {
    if (framedElement?.isConnected) {
      showDesignReviewFrame(framedElement);
    } else {
      hideDesignReviewFrame();
    }
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
      event.preventDefault();
      event.stopPropagation();
      args.onDisableRequested();
    },
    { capture: true }
  );
  const cleanupInaccessibleIframes = addInaccessibleIframeSelectionListener((iframe) => {
    const snapshot = readPageStyleSelectionSnapshot(iframe);
    if (!snapshot) {
      return;
    }
    selectedElement = iframe;
    framedElement = iframe;
    refreshFrame();
    const rect = getAbsolutePosition(iframe);
    args.onSelection({
      anchor: { x: rect.x + Math.min(rect.width, 24), y: rect.y + Math.min(rect.height, 24) },
      snapshot,
    });
  });

  return () => {
    cleanupMove();
    cleanupLeave();
    cleanupClick();
    cleanupKeydown();
    cleanupScroll();
    cleanupResize();
    cleanupInaccessibleIframes();
    removeDesignReviewFrame();
  };
}
