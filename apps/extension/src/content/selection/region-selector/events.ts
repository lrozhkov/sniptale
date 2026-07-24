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
  document.removeEventListener('mousemove', args.handleMouseMove);
  document.removeEventListener('mouseup', args.handleMouseUp);
  document.removeEventListener('pointermove', args.handlePointerMove);
  document.removeEventListener('pointerup', args.handlePointerUp);
  document.removeEventListener('pointercancel', args.handlePointerUp);

  if (!args.state.keyDownHandler) {
    return;
  }

  document.removeEventListener('keydown', args.handleKeyDown);
  args.state.keyDownHandler = null;
}

function bindRegionSelectorDocumentEvents(args: {
  handleKeyDown: (event: KeyboardEvent) => void;
  handlePointerMove: (event: MouseEvent | PointerEvent) => void;
  handlePointerUp: () => void;
  state: RegionSelectorState;
}): void {
  document.addEventListener('mousemove', args.handlePointerMove);
  document.addEventListener('mouseup', args.handlePointerUp);
  document.addEventListener('pointermove', args.handlePointerMove);
  document.addEventListener('pointerup', args.handlePointerUp);
  document.addEventListener('pointercancel', args.handlePointerUp);
  args.state.keyDownHandler = args.handleKeyDown;
  document.addEventListener('keydown', args.handleKeyDown);
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
