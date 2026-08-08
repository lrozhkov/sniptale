import {
  isContentEventWithinAnyElement,
  isContentOwnedEvent,
  queryAllContentUiElements,
  queryContentUiElement,
  resolveContentShadowRoot,
} from '../../platform/dom-host';
import { getOwnedFloatingInteractionLayers } from '@sniptale/ui/floating-interactions/ownership';
import {
  addEventListenerToAllWindowsDynamic,
  addWindowEventListenerToAllWindowsDynamic,
  getAbsolutePosition,
  getViewportClientPoint,
} from '../../platform/frame';
import {
  projectSelectablePageElement,
  resolveSelectablePageProjection,
} from '../page-element-target';
import {
  isTrustedKeyboardEvent,
  isTrustedMouseEvent,
  isTrustedPointerEvent,
} from '../../platform/trusted-events';
import { mountDesignReviewCursor } from './cursor';
import { hideDesignReviewFrame, removeDesignReviewFrame, showDesignReviewFrame } from './frame';
import { addInaccessibleIframeSelectionListener } from './inaccessible-iframe';
import { readPageStyleSelectionSnapshot, type PageStyleSelectionSnapshot } from './snapshot';

export interface DesignReviewSelection {
  anchor: { x: number; y: number };
  snapshot: PageStyleSelectionSnapshot;
}

export interface DesignReviewPickerRuntime {
  dismissSelection: () => void;
  dispose: () => void;
  selectElement: (element: Element) => boolean;
}

interface DesignReviewPickerArgs {
  onDisableRequested: () => void;
  onInspectorDismissRequested: () => boolean;
  onSelection: (selection: DesignReviewSelection) => void;
}

interface DesignReviewPickerInteractionState {
  framedElement: Element | null;
  inspectorPointerGestureStarted: boolean;
  selectedElement: Element | null;
}

const DESIGN_REVIEW_INTERACTION_ROOT_SELECTOR = [
  '[data-ui="content.design-review.popover"]',
  '[data-ui="content.design-review.feedback-panel"]',
  '[data-ui="content.annotation-marker"]',
].join(',');

function resolveSelectableSnapshot(element: Element): PageStyleSelectionSnapshot | null {
  return projectSelectablePageElement(element, readPageStyleSelectionSnapshot);
}

function resolveSelection(
  event: MouseEvent,
  iframe?: HTMLIFrameElement
): DesignReviewSelection | null {
  const snapshot = resolveSelectablePageProjection(event, readPageStyleSelectionSnapshot, iframe);
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

function isInspectorInteractionEvent(event: MouseEvent): boolean {
  const interactionRoots = queryAllContentUiElements(DESIGN_REVIEW_INTERACTION_ROOT_SELECTOR);
  const contentRoot = resolveContentShadowRoot();
  const ownedLayers = contentRoot
    ? interactionRoots.flatMap((root) => getOwnedFloatingInteractionLayers(root, contentRoot))
    : [];
  return isContentEventWithinAnyElement(event, [...interactionRoots, ...ownedLayers]);
}

function claimPageClick(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function refreshPickerFrame(state: DesignReviewPickerInteractionState): void {
  if (state.framedElement?.isConnected) {
    showDesignReviewFrame(state.framedElement);
  } else {
    hideDesignReviewFrame();
  }
}

function dismissPickerSelection(state: DesignReviewPickerInteractionState): void {
  state.selectedElement = null;
  state.framedElement = null;
  state.inspectorPointerGestureStarted = false;
  hideDesignReviewFrame();
}

function selectPickerSelection(
  state: DesignReviewPickerInteractionState,
  args: DesignReviewPickerArgs,
  selection: DesignReviewSelection
): void {
  state.inspectorPointerGestureStarted = false;
  state.selectedElement = selection.snapshot.element;
  state.framedElement = state.selectedElement;
  refreshPickerFrame(state);
  args.onSelection(selection);
}

function selectPickerElement(
  state: DesignReviewPickerInteractionState,
  args: DesignReviewPickerArgs,
  element: Element
): boolean {
  const selection = resolveElementSelection(element);
  if (!selection) return false;
  selectPickerSelection(state, args, selection);
  return true;
}

function handlePickerMouseMove(
  state: DesignReviewPickerInteractionState,
  event: MouseEvent,
  iframe?: HTMLIFrameElement
): void {
  if (!isTrustedMouseEvent(event)) return;
  if (state.selectedElement) {
    state.framedElement = state.selectedElement;
  } else {
    state.framedElement = resolveSelection(event, iframe)?.snapshot.element ?? null;
  }
  refreshPickerFrame(state);
}

function handlePickerMouseLeave(state: DesignReviewPickerInteractionState): void {
  state.framedElement = state.selectedElement;
  refreshPickerFrame(state);
}

function handlePickerClick(
  state: DesignReviewPickerInteractionState,
  args: DesignReviewPickerArgs,
  event: MouseEvent,
  iframe?: HTMLIFrameElement
): void {
  if (!isTrustedMouseEvent(event)) return;
  const inspectorPointerGestureStarted = state.inspectorPointerGestureStarted;
  state.inspectorPointerGestureStarted = false;
  if (!state.selectedElement) {
    const selection = resolveSelection(event, iframe);
    if (!selection) return;
    selectPickerSelection(state, args, selection);
    claimPageClick(event);
    return;
  }
  if (isInspectorInteractionEvent(event) || inspectorPointerGestureStarted) return;

  const contentOwned = isContentOwnedEvent(event);
  const dismissed = args.onInspectorDismissRequested();
  if (dismissed) {
    dismissPickerSelection(state);
    state.framedElement = contentOwned
      ? null
      : (resolveSelection(event, iframe)?.snapshot.element ?? null);
    refreshPickerFrame(state);
  }
  if (!contentOwned || !dismissed) claimPageClick(event);
}

function handlePickerPointerDown(
  state: DesignReviewPickerInteractionState,
  event: PointerEvent
): void {
  if (!isTrustedPointerEvent(event)) return;
  state.inspectorPointerGestureStarted = Boolean(
    state.selectedElement && isInspectorInteractionEvent(event)
  );
}

function handleInaccessibleIframeSelection(
  state: DesignReviewPickerInteractionState,
  args: DesignReviewPickerArgs,
  iframe: HTMLIFrameElement
): void {
  if (!state.selectedElement) {
    selectPickerElement(state, args, iframe);
    return;
  }
  if (args.onInspectorDismissRequested()) {
    dismissPickerSelection(state);
    state.framedElement = iframe;
    refreshPickerFrame(state);
  }
}

/** Owns trusted page picking for the active Design Review mode. */
export function startDesignReviewPicker(args: DesignReviewPickerArgs): DesignReviewPickerRuntime {
  const state: DesignReviewPickerInteractionState = {
    framedElement: null,
    inspectorPointerGestureStarted: false,
    selectedElement: null,
  };
  const cleanupCursor = mountDesignReviewCursor();
  const cleanupMove = addEventListenerToAllWindowsDynamic<MouseEvent>(
    'mousemove',
    (event, iframe) => handlePickerMouseMove(state, event, iframe),
    { capture: true }
  );
  const cleanupLeave = addEventListenerToAllWindowsDynamic<MouseEvent>(
    'mouseleave',
    () => handlePickerMouseLeave(state),
    { capture: true }
  );
  const cleanupClick = addEventListenerToAllWindowsDynamic<MouseEvent>(
    'click',
    (event, iframe) => handlePickerClick(state, args, event, iframe),
    { capture: true }
  );
  const cleanupPointerDown = addEventListenerToAllWindowsDynamic<PointerEvent>(
    'pointerdown',
    (event) => handlePickerPointerDown(state, event),
    { capture: true }
  );
  const cleanupScroll = addEventListenerToAllWindowsDynamic<Event>(
    'scroll',
    () => refreshPickerFrame(state),
    { capture: true }
  );
  const cleanupResize = addWindowEventListenerToAllWindowsDynamic<Event>('resize', () =>
    refreshPickerFrame(state)
  );
  const cleanupKeydown = addEventListenerToAllWindowsDynamic<KeyboardEvent>(
    'keydown',
    (event) => {
      if (event.defaultPrevented || !isTrustedKeyboardEvent(event) || event.key !== 'Escape') {
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
      if (state.selectedElement) {
        args.onInspectorDismissRequested();
        return;
      }
      args.onDisableRequested();
    },
    { capture: true }
  );
  const cleanupInaccessibleIframes = addInaccessibleIframeSelectionListener((iframe) =>
    handleInaccessibleIframeSelection(state, args, iframe)
  );

  return {
    dismissSelection: () => dismissPickerSelection(state),
    dispose: () => {
      cleanupMove();
      cleanupLeave();
      cleanupClick();
      cleanupPointerDown();
      cleanupKeydown();
      cleanupScroll();
      cleanupResize();
      cleanupInaccessibleIframes();
      cleanupCursor();
      removeDesignReviewFrame();
    },
    selectElement: (element) => selectPickerElement(state, args, element),
  };
}
