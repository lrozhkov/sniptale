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
  resolveSelectablePageElement,
  resolveSelectablePageProjection,
} from '../page-element-target';
import {
  isTrustedKeyboardEvent,
  isTrustedMouseEvent,
  isTrustedPointerEvent,
} from '../../platform/trusted-events';
import { createDesignReviewMeasurements } from './measurements';
import { mountDesignReviewCursor } from './cursor';
import { hideDesignReviewFrame, removeDesignReviewFrame, showDesignReviewFrame } from './frame';
import { addInaccessibleIframeSelectionListener } from './inaccessible-iframe';
import { readPageStyleSelectionSnapshot, type PageStyleSelectionSnapshot } from './snapshot';

export type DesignReviewSelectionOrigin =
  | 'page'
  | 'tree'
  | 'feedback'
  | 'draft'
  | 'finding'
  | 'tool';

export interface DesignReviewSelection {
  anchor: { x: number; y: number };
  snapshot: PageStyleSelectionSnapshot;
}

export interface DesignReviewPickerRuntime {
  setTextEditing: (editing: boolean) => void;
  setMeasurementsEnabled: (enabled: boolean) => void;
  setMeasurementsExpanded: (expanded: boolean) => void;
  dismissSelection: () => void;
  dispose: () => void;
  selectElement: (element: Element, origin?: DesignReviewSelectionOrigin) => boolean;
  refreshFrame(): void;
}

interface DesignReviewPickerArgs {
  onDisableRequested: () => void;
  onInspectorDismissRequested: (event?: KeyboardEvent) => boolean;
  hasInspector?: () => boolean;
  onSelection: (
    selection: DesignReviewSelection,
    origin?: DesignReviewSelectionOrigin
  ) => boolean | void;
  onHover?: (element: Element | null) => void;
  trackHover?: () => boolean;
  isFrameSuppressed?: () => boolean;
  replaceSelectionOnClick?: () => boolean;
}

interface DesignReviewPickerInteractionState {
  editingText: boolean;
  framedElement: Element | null;
  inspectorPointerGestureStarted: boolean;
  selectedElement: Element | null;
}

const DESIGN_REVIEW_INTERACTION_ROOT_SELECTOR = [
  '[data-ui="content.toolbar.root"]',
  '[data-ui="content.design-review.popover"]',
  '[data-ui="content.design-review.tool-panel"]',
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

function refreshPickerFrame(
  state: DesignReviewPickerInteractionState,
  args: DesignReviewPickerArgs
): void {
  const target = state.selectedElement ?? state.framedElement;
  if (!state.editingText && !args.isFrameSuppressed?.() && target?.isConnected) {
    showDesignReviewFrame(target, target === state.selectedElement, false, state.framedElement);
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
  selection: DesignReviewSelection,
  origin: DesignReviewSelectionOrigin = 'page'
): boolean {
  if (args.onSelection(selection, origin) === false) return false;
  state.inspectorPointerGestureStarted = false;
  state.selectedElement = selection.snapshot.element;
  state.framedElement = state.selectedElement;
  refreshPickerFrame(state, args);
  return true;
}

function selectPickerElement(
  state: DesignReviewPickerInteractionState,
  args: DesignReviewPickerArgs,
  element: Element,
  origin: DesignReviewSelectionOrigin = 'tree'
): boolean {
  const selection = resolveElementSelection(element);
  if (!selection) return false;
  return selectPickerSelection(state, args, selection, origin);
}

function handlePickerMouseMove(
  state: DesignReviewPickerInteractionState,
  event: MouseEvent,
  args: DesignReviewPickerArgs,
  iframe?: HTMLIFrameElement
): void {
  if (!isTrustedMouseEvent(event)) return;
  if (args.trackHover?.() && !isInspectorInteractionEvent(event))
    args.onHover?.(resolveSelectablePageElement(event, iframe));
  state.framedElement = isInspectorInteractionEvent(event)
    ? null
    : (resolveSelection(event, iframe)?.snapshot.element ?? null);
  refreshPickerFrame(state, args);
}

function handlePickerMouseLeave(
  state: DesignReviewPickerInteractionState,
  args: DesignReviewPickerArgs
): void {
  args.onHover?.(null);
  state.framedElement = state.selectedElement;
  refreshPickerFrame(state, args);
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
  if (isInspectorInteractionEvent(event)) return;
  if (inspectorPointerGestureStarted) {
    claimPageClick(event);
    return;
  }

  if (args.replaceSelectionOnClick?.()) {
    const selection = resolveSelection(event, iframe);
    if (selection) {
      selectPickerSelection(state, args, selection);
      claimPageClick(event);
      return;
    }
  }
  const contentOwned = isContentOwnedEvent(event);
  const dismissed = args.onInspectorDismissRequested();
  if (dismissed) {
    dismissPickerSelection(state);
    state.framedElement = contentOwned
      ? null
      : (resolveSelection(event, iframe)?.snapshot.element ?? null);
    refreshPickerFrame(state, args);
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
    refreshPickerFrame(state, args);
  }
}

/** Owns trusted page picking for the active Design Review mode. */
export function startDesignReviewPicker(args: DesignReviewPickerArgs): DesignReviewPickerRuntime {
  const state: DesignReviewPickerInteractionState = {
    editingText: false,
    framedElement: null,
    inspectorPointerGestureStarted: false,
    selectedElement: null,
  };
  const measurements = createDesignReviewMeasurements();
  let cleanupCursor = mountDesignReviewCursor();
  const cleanupMove = addEventListenerToAllWindowsDynamic<MouseEvent>(
    'mousemove',
    (event, iframe) => {
      if (state.editingText) return;
      handlePickerMouseMove(state, event, args, iframe);
      if (isTrustedMouseEvent(event) && !state.inspectorPointerGestureStarted)
        measurements.hover(state.selectedElement ?? resolveSelectablePageElement(event, iframe));
    },
    { capture: true }
  );
  const cleanupLeave = addEventListenerToAllWindowsDynamic<MouseEvent>(
    'mouseleave',
    () => {
      if (state.editingText) return;
      handlePickerMouseLeave(state, args);
      measurements.hover(state.selectedElement);
    },
    { capture: true }
  );
  const cleanupClick = addEventListenerToAllWindowsDynamic<MouseEvent>(
    'click',
    (event, iframe) => {
      if (state.editingText) return;
      handlePickerClick(state, args, event, iframe);
      if (isTrustedMouseEvent(event)) measurements.hover(state.selectedElement);
    },
    { capture: true }
  );
  const cleanupPointerDown = addEventListenerToAllWindowsDynamic<PointerEvent>(
    'pointerdown',
    (event) => {
      if (!state.editingText) handlePickerPointerDown(state, event);
    },
    { capture: true }
  );
  const cleanupScroll = addEventListenerToAllWindowsDynamic<Event>(
    'scroll',
    () => refreshPickerFrame(state, args),
    { capture: true }
  );
  const cleanupResize = addWindowEventListenerToAllWindowsDynamic<Event>('resize', () =>
    refreshPickerFrame(state, args)
  );
  const cleanupKeydown = addWindowEventListenerToAllWindowsDynamic<KeyboardEvent>(
    'keydown',
    (event) => {
      if (state.editingText) return;
      if (!isTrustedKeyboardEvent(event) || event.key !== 'Escape') {
        return;
      }
      if (
        queryContentUiElement(
          [
            '[data-ui="content.design-review.feedback-panel"]',
            '[data-ui="content.design-review.action-menu"]',
            '[data-ui="content.toolbar.root"][data-menu-open="true"]',
          ].join(',')
        )
      ) {
        return;
      }
      const contentRoot = resolveContentShadowRoot();
      if (
        contentRoot &&
        queryAllContentUiElements(DESIGN_REVIEW_INTERACTION_ROOT_SELECTOR).some((owner) =>
          getOwnedFloatingInteractionLayers(owner, contentRoot).some(
            (layer) => layer.getClientRects().length > 0
          )
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (state.selectedElement || args.hasInspector?.()) {
        args.onInspectorDismissRequested(event);
        return;
      }
      args.onDisableRequested();
    },
    { capture: true }
  );
  const cleanupInaccessibleIframes = addInaccessibleIframeSelectionListener((iframe) => {
    if (state.editingText) return;
    handleInaccessibleIframeSelection(state, args, iframe);
    measurements.hover(state.selectedElement);
  });

  return {
    setTextEditing: (editing) => {
      if (state.editingText === editing) return;
      state.editingText = editing;
      state.framedElement = state.selectedElement;
      state.inspectorPointerGestureStarted = false;
      cleanupCursor();
      cleanupCursor = editing ? () => undefined : mountDesignReviewCursor();
      measurements.hover(editing ? null : state.selectedElement);
      refreshPickerFrame(state, args);
    },
    dismissSelection: () => {
      dismissPickerSelection(state);
      measurements.hover(null);
    },
    setMeasurementsEnabled: measurements.setEnabled,
    setMeasurementsExpanded: measurements.setExpanded,
    dispose: () => {
      measurements.dispose();
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
    refreshFrame: () => refreshPickerFrame(state, args),
    selectElement: (element, origin = 'tree') => {
      const selected = selectPickerElement(state, args, element, origin);
      if (selected) measurements.hover(state.selectedElement);
      return selected;
    },
  };
}
