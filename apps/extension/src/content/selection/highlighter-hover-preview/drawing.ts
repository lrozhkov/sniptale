import { appendToContentOverlayRoot, queryAllContentUiElements } from '../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../platform/dom-host/isolated';
import {
  createDocumentPagePlacement,
  getDocumentViewportBounds,
  getTopViewportPoint,
} from '../../platform/frame';
import { resolvePagePreparationTarget } from '../../parser/page-preparation/target';
import {
  colorToRgba,
  resolveBorderPresetVisual,
  resolveBorderShadowVisual,
} from '../../../features/highlighter/style';
import type { FreeFrameInput } from '../../../features/highlighter/contracts';
import type { HighlighterCallbacks, HighlighterStateGetters } from './interactions';
import { getCurrentBorderPreset, type HoverSession } from './session';
import { hasBlockingHighlighterPopover, isHighlighterExtensionUiElement } from './targets';
import { useFrameUIStore } from '../frame-runtime/state/frame-ui.store';

const DRAW_THRESHOLD = 5;
const MIN_DRAW_SIZE = 10;

type DrawRect = Pick<FreeFrameInput, 'x' | 'y' | 'width' | 'height'>;

export interface FreeFramePointerEvent extends Event {
  button: number;
  clientX: number;
  clientY: number;
  pointerId: number;
}

export type DrawingCancelReason =
  | 'blur'
  | 'escape'
  | 'mouseleave'
  | 'pointercancel'
  | 'scroll'
  | 'teardown';

type FreeFrameDrawingProps = {
  getCallbacks: () => HighlighterCallbacks;
  getState: HighlighterStateGetters;
  hideHoverOverlay: () => void;
  session: HoverSession;
};

type FreeDrawGesture = NonNullable<HoverSession['freeDraw']['gesture']>;

function consumePointerEvent(event: FreeFramePointerEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function getClickPointerId(event: MouseEvent | undefined): number | null {
  if (!event) return null;
  const pointerId = (event as Partial<PointerEvent>).pointerId;
  return typeof pointerId === 'number' ? pointerId : null;
}

function ensurePreviewRoot(session: HoverSession): HTMLElement {
  if (session.freeDraw.previewRoot) return session.freeDraw.previewRoot;
  const root = document.createElement('div');
  root.className = 'sniptale-free-frame-draft-portal';
  applyIsolatedContentRootStyle(
    root,
    'position: fixed; inset: 0; pointer-events: none; z-index: 2147483645;'
  );
  appendToContentOverlayRoot(root);
  session.freeDraw.previewRoot = root;
  return root;
}

function ensurePreview(session: HoverSession): HTMLElement {
  if (session.freeDraw.preview) return session.freeDraw.preview;
  const preview = document.createElement('div');
  preview.className = 'sniptale-free-frame-draft';
  const preset = getCurrentBorderPreset(session);
  const visual = resolveBorderPresetVisual(preset);
  preview.style.cssText = `
    position: fixed;
    box-sizing: content-box;
    pointer-events: none;
    border: ${visual.strokeWidth}px ${visual.strokeStyle} ${colorToRgba(
      visual.strokeColor,
      visual.strokeOpacity
    )};
    border-radius: ${visual.radius}px;
    background: ${colorToRgba(visual.fillColor, visual.fillOpacity)};
    opacity: 0.88;
    box-shadow: ${resolveBorderShadowVisual(visual.shadow, visual.strokeColor).hoverBoxShadow ?? 'none'};
  `;
  Object.assign(preview.style, visual.customCssStyles);
  ensurePreviewRoot(session).appendChild(preview);
  session.freeDraw.preview = preview;
  return preview;
}

function removePreview(session: HoverSession) {
  session.freeDraw.preview?.remove();
  session.freeDraw.previewRoot?.remove();
  session.freeDraw.preview = null;
  session.freeDraw.previewRoot = null;
  queryAllContentUiElements('.sniptale-free-frame-draft-portal').forEach((element) =>
    element.remove()
  );
}

function normalizeDrawAxis(
  start: number,
  end: number,
  boundsStart: number,
  boundsEnd: number
): { start: number; size: number } {
  const clampedStart = clamp(start, boundsStart, boundsEnd);
  const clampedEnd = clamp(end, boundsStart, boundsEnd);
  if (Math.abs(clampedEnd - clampedStart) >= MIN_DRAW_SIZE) {
    return {
      start: Math.min(clampedStart, clampedEnd),
      size: Math.abs(clampedEnd - clampedStart),
    };
  }

  const preferredDirection = clampedEnd < clampedStart ? -1 : 1;
  const preferredEnd = clamp(
    clampedStart + preferredDirection * MIN_DRAW_SIZE,
    boundsStart,
    boundsEnd
  );
  const fallbackEnd = clamp(
    clampedStart - preferredDirection * MIN_DRAW_SIZE,
    boundsStart,
    boundsEnd
  );
  const expandedEnd =
    Math.abs(preferredEnd - clampedStart) >= MIN_DRAW_SIZE ? preferredEnd : fallbackEnd;
  return {
    start: Math.min(clampedStart, expandedEnd),
    size: Math.abs(expandedEnd - clampedStart),
  };
}

function normalizeMinimumDrawRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  viewportBounds: { x: number; y: number; width: number; height: number }
): DrawRect {
  const horizontal = normalizeDrawAxis(
    startX,
    endX,
    viewportBounds.x,
    viewportBounds.x + viewportBounds.width
  );
  const vertical = normalizeDrawAxis(
    startY,
    endY,
    viewportBounds.y,
    viewportBounds.y + viewportBounds.height
  );
  return {
    x: horizontal.start,
    y: vertical.start,
    width: horizontal.size,
    height: vertical.size,
  };
}

function normalizeDrawRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  viewportBounds: { x: number; y: number; width: number; height: number }
): DrawRect {
  const clampedStartX = clamp(startX, viewportBounds.x, viewportBounds.x + viewportBounds.width);
  const clampedStartY = clamp(startY, viewportBounds.y, viewportBounds.y + viewportBounds.height);
  const clampedEndX = clamp(endX, viewportBounds.x, viewportBounds.x + viewportBounds.width);
  const clampedEndY = clamp(endY, viewportBounds.y, viewportBounds.y + viewportBounds.height);
  return {
    x: Math.min(clampedStartX, clampedEndX),
    y: Math.min(clampedStartY, clampedEndY),
    width: Math.abs(clampedEndX - clampedStartX),
    height: Math.abs(clampedEndY - clampedStartY),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function renderPreview(session: HoverSession, rect: DrawRect) {
  const preview = ensurePreview(session);
  preview.style.left = `${rect.x}px`;
  preview.style.top = `${rect.y}px`;
  preview.style.width = `${rect.width}px`;
  preview.style.height = `${rect.height}px`;
}

function resolveEventDocument(event: Event, iframe?: HTMLIFrameElement): Document | null {
  if (event.target instanceof Node) return event.target.ownerDocument;
  return iframe?.contentDocument ?? document;
}

function canStartDrawing(props: {
  event: FreeFramePointerEvent;
  getState: HighlighterStateGetters;
  iframe?: HTMLIFrameElement;
}) {
  if (
    props.event.button !== 0 ||
    !props.getState.isModeEnabled() ||
    props.getState.isPaused() ||
    props.getState.isFrameEditing() ||
    hasBlockingHighlighterPopover()
  ) {
    return null;
  }
  const target = resolvePagePreparationTarget(props.event, props.iframe);
  return target && !isHighlighterExtensionUiElement(target) ? target : null;
}

function cancelDrawing(props: FreeFrameDrawingProps, reason: DrawingCancelReason = 'teardown') {
  const gesture = props.session.freeDraw.gesture;
  if (gesture && (reason === 'blur' || reason === 'mouseleave' || reason === 'scroll')) {
    return false;
  }
  const hadGesture = gesture !== null;
  if (reason === 'escape' && gesture) {
    props.session.freeDraw.clickSuppression = {
      awaitingPointerUp: true,
      pointerId: gesture.pointerId,
    };
  } else if (reason !== 'escape') {
    props.session.freeDraw.clickSuppression = null;
  }
  props.session.freeDraw.gesture = null;
  removePreview(props.session);
  return hadGesture;
}

function handlePointerDown(
  props: FreeFrameDrawingProps,
  event: FreeFramePointerEvent,
  iframe?: HTMLIFrameElement
) {
  if (event.button === 0) props.session.freeDraw.clickSuppression = null;
  const target = canStartDrawing({
    event,
    getState: props.getState,
    ...(iframe ? { iframe } : {}),
  });
  if (!target || !props.getCallbacks().addFreeFrame) return;
  const ownerDocument = target.ownerDocument;
  const point = getTopViewportPoint(ownerDocument, event.clientX, event.clientY);
  const viewportBounds = getDocumentViewportBounds(ownerDocument);
  if (!point || !viewportBounds) return;
  props.session.freeDraw.gesture = {
    ownerDocument,
    pointerId: event.pointerId,
    sourceElement: target,
    startX: point.x,
    startY: point.y,
    viewportBounds,
    isDrawing: false,
  };
}

function enterDrawingState(props: FreeFrameDrawingProps, gesture: FreeDrawGesture) {
  gesture.isDrawing = true;
  const frameUi = useFrameUIStore.getState();
  frameUi.dismissFrameUi();
  frameUi.setResizeFrame(null);
  if (props.session.hoverRafId !== null) {
    cancelAnimationFrame(props.session.hoverRafId);
    props.session.hoverRafId = null;
  }
  props.hideHoverOverlay();
  props.session.lastHoverTarget = null;
}

function handlePointerMove(
  props: FreeFrameDrawingProps,
  event: FreeFramePointerEvent,
  iframe?: HTMLIFrameElement
) {
  const gesture = props.session.freeDraw.gesture;
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const ownerDocument = resolveEventDocument(event, iframe);
  if (!ownerDocument) return;
  const point = getTopViewportPoint(ownerDocument, event.clientX, event.clientY);
  if (!point) return;
  if (!gesture.isDrawing) {
    if (Math.hypot(point.x - gesture.startX, point.y - gesture.startY) <= DRAW_THRESHOLD) return;
    enterDrawingState(props, gesture);
  }
  consumePointerEvent(event);
  const endX = clamp(
    point.x,
    gesture.viewportBounds.x,
    gesture.viewportBounds.x + gesture.viewportBounds.width
  );
  const endY = clamp(
    point.y,
    gesture.viewportBounds.y,
    gesture.viewportBounds.y + gesture.viewportBounds.height
  );
  renderPreview(
    props.session,
    normalizeMinimumDrawRect(gesture.startX, gesture.startY, endX, endY, gesture.viewportBounds)
  );
}

function commitFreeFrame(
  props: FreeFrameDrawingProps,
  gesture: FreeDrawGesture,
  event: FreeFramePointerEvent,
  iframe?: HTMLIFrameElement
) {
  const ownerDocument = resolveEventDocument(event, iframe) ?? gesture.ownerDocument;
  const point = getTopViewportPoint(ownerDocument, event.clientX, event.clientY);
  if (!point) return;
  const rect = normalizeDrawRect(
    gesture.startX,
    gesture.startY,
    point.x,
    point.y,
    gesture.viewportBounds
  );
  if (rect.width < MIN_DRAW_SIZE || rect.height < MIN_DRAW_SIZE) return;
  const pagePlacement = createDocumentPagePlacement(gesture.ownerDocument, rect.x, rect.y);
  if (!pagePlacement) return;
  props.getCallbacks().addFreeFrame?.({ ...rect, pagePlacement }, gesture.sourceElement);
  props.session.isHoverPreviewFrozen = true;
}

function handlePointerUp(
  props: FreeFrameDrawingProps,
  event: FreeFramePointerEvent,
  iframe?: HTMLIFrameElement
) {
  const gesture = props.session.freeDraw.gesture;
  if (!gesture) {
    const suppression = props.session.freeDraw.clickSuppression;
    if (suppression?.awaitingPointerUp && suppression.pointerId === event.pointerId) {
      consumePointerEvent(event);
      suppression.awaitingPointerUp = false;
    }
    return;
  }
  if (gesture.pointerId !== event.pointerId) return;
  props.session.freeDraw.gesture = null;
  if (!gesture.isDrawing) return;
  consumePointerEvent(event);
  props.session.freeDraw.clickSuppression = {
    awaitingPointerUp: false,
    pointerId: event.pointerId,
  };
  commitFreeFrame(props, gesture, event, iframe);
  removePreview(props.session);
}

function consumeSuppressedClick(props: FreeFrameDrawingProps, event?: MouseEvent) {
  const gesture = props.session.freeDraw.gesture;
  if (gesture) {
    props.session.freeDraw.gesture = null;
    removePreview(props.session);
    if (gesture.isDrawing) {
      props.session.freeDraw.clickSuppression = null;
      return true;
    }
  }
  const suppression = props.session.freeDraw.clickSuppression;
  if (!suppression) return false;
  const pointerId = getClickPointerId(event);
  if (event && pointerId === null && event.detail === 0) return false;
  if (pointerId !== null && pointerId !== suppression.pointerId) return false;
  props.session.freeDraw.clickSuppression = null;
  return true;
}

export function createFreeFrameDrawingHandlers(props: FreeFrameDrawingProps) {
  return {
    handlePointerDown: (event: FreeFramePointerEvent, iframe?: HTMLIFrameElement) =>
      handlePointerDown(props, event, iframe),
    handlePointerMove: (event: FreeFramePointerEvent, iframe?: HTMLIFrameElement) =>
      handlePointerMove(props, event, iframe),
    handlePointerUp: (event: FreeFramePointerEvent, iframe?: HTMLIFrameElement) =>
      handlePointerUp(props, event, iframe),
    cancelDrawing: (reason?: DrawingCancelReason) => cancelDrawing(props, reason),
    consumeSuppressedClick: (event?: MouseEvent) => consumeSuppressedClick(props, event),
  };
}
