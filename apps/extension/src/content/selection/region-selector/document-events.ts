import { updateDraggingRegion, updateResizingRegion } from './helpers';
import { updateRegionSelectorUi } from './surface';
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

function createRegionSelectorPointerMoveHandler(state: RegionSelectorState) {
  return (event: MouseEvent | PointerEvent): void => {
    if (!state.isDragging && !state.isResizing) {
      return;
    }

    state.currentRegion = state.isDragging
      ? updateDraggingRegion(state.initialRegion, state.currentRegion, state.dragStart, event)
      : updateResizingRegion(
          state.initialRegion,
          state.currentRegion,
          state.dragStart,
          state.resizeCorner,
          event
        );

    updateRegionSelectorUi(state);
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
}): RegionSelectorDocumentHandlers {
  const handlePointerMove = createRegionSelectorPointerMoveHandler(args.state);
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
