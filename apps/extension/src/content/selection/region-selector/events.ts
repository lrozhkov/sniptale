import { updateDraggingRegion, updateResizingRegion } from './helpers';
import type { createDefaultRegionSelectorState } from './types';

type RegionSelectorState = ReturnType<typeof createDefaultRegionSelectorState>;

type RegionSelectorDocumentHandlers = {
  bindDocumentEvents: () => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  handleMouseMove: (event: MouseEvent | PointerEvent) => void;
  handleMouseUp: () => void;
  handlePointerMove: (event: MouseEvent | PointerEvent) => void;
  handlePointerUp: () => void;
};

const REGION_GESTURE_LISTENER_OPTIONS: AddEventListenerOptions = { capture: true };

export function bindRegionSelectorRootEvents(props: {
  overlay: HTMLElement;
  region: HTMLElement;
  handleRegionCancelled: () => void;
  onDragStart: (event: MouseEvent | PointerEvent) => void;
  onResizeStart: (event: MouseEvent | PointerEvent, corner: string) => void;
}) {
  const handleOverlayPress = (event: MouseEvent | PointerEvent) => {
    const target = event.target as HTMLElement | null;
    const shouldCancel =
      target === props.overlay || Boolean(target?.closest('[data-ui="content.region-mask"]'));
    if (shouldCancel) {
      props.handleRegionCancelled();
    }
  };

  const handleRegionPress = (event: MouseEvent | PointerEvent) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains('sniptale-resize')) {
      props.onResizeStart(event, target.dataset['corner'] || '');
      return;
    }

    props.onDragStart(event);
  };

  props.overlay.addEventListener('pointerdown', handleOverlayPress);
  props.overlay.addEventListener('mousedown', handleOverlayPress);
  props.region.addEventListener('pointerdown', handleRegionPress);
  props.region.addEventListener('mousedown', handleRegionPress);
}

export function detachRegionSelectorListeners(args: {
  handleKeyDown: (event: KeyboardEvent) => void;
  handleMouseMove: (event: MouseEvent | PointerEvent) => void;
  handleMouseUp: () => void;
  handlePointerMove: (event: MouseEvent | PointerEvent) => void;
  handlePointerUp: () => void;
  state: RegionSelectorState;
}): void {
  window.removeEventListener('mousemove', args.handleMouseMove, REGION_GESTURE_LISTENER_OPTIONS);
  window.removeEventListener('mouseup', args.handleMouseUp, REGION_GESTURE_LISTENER_OPTIONS);
  window.removeEventListener(
    'pointermove',
    args.handlePointerMove,
    REGION_GESTURE_LISTENER_OPTIONS
  );
  window.removeEventListener('pointerup', args.handlePointerUp, REGION_GESTURE_LISTENER_OPTIONS);
  window.removeEventListener(
    'pointercancel',
    args.handlePointerUp,
    REGION_GESTURE_LISTENER_OPTIONS
  );

  if (!args.state.keyDownHandler) {
    return;
  }

  window.removeEventListener('keydown', args.handleKeyDown, REGION_GESTURE_LISTENER_OPTIONS);
  args.state.keyDownHandler = null;
}

function bindRegionSelectorDocumentEvents(args: {
  handleKeyDown: (event: KeyboardEvent) => void;
  handlePointerMove: (event: MouseEvent | PointerEvent) => void;
  handlePointerUp: () => void;
  state: RegionSelectorState;
}): void {
  window.addEventListener('mousemove', args.handlePointerMove, REGION_GESTURE_LISTENER_OPTIONS);
  window.addEventListener('mouseup', args.handlePointerUp, REGION_GESTURE_LISTENER_OPTIONS);
  window.addEventListener('pointermove', args.handlePointerMove, REGION_GESTURE_LISTENER_OPTIONS);
  window.addEventListener('pointerup', args.handlePointerUp, REGION_GESTURE_LISTENER_OPTIONS);
  window.addEventListener('pointercancel', args.handlePointerUp, REGION_GESTURE_LISTENER_OPTIONS);
  args.state.keyDownHandler = args.handleKeyDown;
  window.addEventListener('keydown', args.handleKeyDown, REGION_GESTURE_LISTENER_OPTIONS);
}

function createRegionSelectorPointerMoveHandler(args: {
  state: RegionSelectorState;
  updateUi: () => void;
}) {
  return (event: MouseEvent | PointerEvent): void => {
    if (!args.state.isDragging && !args.state.isResizing) {
      return;
    }

    args.state.currentRegion = args.state.isDragging
      ? updateDraggingRegion(
          args.state.initialRegion,
          args.state.currentRegion,
          args.state.dragStart,
          event
        )
      : updateResizingRegion(
          args.state.initialRegion,
          args.state.currentRegion,
          args.state.dragStart,
          args.state.resizeCorner,
          event
        );

    args.updateUi();
  };
}

function createRegionSelectorPointerUpHandler(state: RegionSelectorState) {
  return (): void => {
    state.isDragging = false;
    state.isResizing = false;
  };
}

function createRegionSelectorKeyDownHandler(handleRegionCancelled: () => void) {
  return (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      handleRegionCancelled();
    }
  };
}

export function createRegionSelectorDocumentHandlers(args: {
  handleRegionCancelled: () => void;
  state: RegionSelectorState;
  updateUi: () => void;
}): RegionSelectorDocumentHandlers {
  const handlePointerMove = createRegionSelectorPointerMoveHandler(args);
  const handlePointerUp = createRegionSelectorPointerUpHandler(args.state);
  const handleKeyDown = createRegionSelectorKeyDownHandler(args.handleRegionCancelled);

  return {
    bindDocumentEvents: () =>
      bindRegionSelectorDocumentEvents({
        handleKeyDown,
        handlePointerMove,
        handlePointerUp,
        state: args.state,
      }),
    handleKeyDown,
    handleMouseMove: handlePointerMove,
    handleMouseUp: handlePointerUp,
    handlePointerMove,
    handlePointerUp,
  };
}
