import type { SelectedArea } from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  completeAreaSelection,
  createSelectionElement,
  handleAreaSelectionTimeout,
  hideSelectionElement,
  removeAreaSelectionTooltip,
  showAreaSelectionTooltip,
  updateSelectionBox,
} from './helpers';

const logger = createLogger({ namespace: 'ContentAreaSelector' });

type ActiveAreaSelection = {
  onMouseDown: (event: MouseEvent) => void;
  onMouseMove: (event: MouseEvent) => void;
  onMouseUp: (event: MouseEvent) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type AreaSelectionState = {
  activeSelection: ActiveAreaSelection | null;
  isSelecting: boolean;
  onAreaSelectedCallback: ((area: SelectedArea) => void) | null;
  selectionElement: HTMLDivElement | null;
  startX: number;
  startY: number;
};

export interface AreaSelectionRuntimeDeps {
  clearScheduledTimeout: (timeoutId: ReturnType<typeof setTimeout>) => void;
  completeAreaSelection: typeof completeAreaSelection;
  createSelectionElement: typeof createSelectionElement;
  handleAreaSelectionTimeout: typeof handleAreaSelectionTimeout;
  hideSelectionElement: typeof hideSelectionElement;
  removeAreaSelectionTooltip: typeof removeAreaSelectionTooltip;
  scheduleTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  showAreaSelectionTooltip: typeof showAreaSelectionTooltip;
  targetDocument: Document;
  updateSelectionBox: typeof updateSelectionBox;
}

export function createAreaSelectionState(): AreaSelectionState {
  return {
    activeSelection: null,
    isSelecting: false,
    onAreaSelectedCallback: null,
    selectionElement: null,
    startX: 0,
    startY: 0,
  };
}

function clearActiveAreaSelection(
  state: Pick<AreaSelectionState, 'activeSelection' | 'isSelecting'>,
  deps: Pick<AreaSelectionRuntimeDeps, 'clearScheduledTimeout' | 'targetDocument'>
) {
  if (!state.activeSelection) {
    state.isSelecting = false;
    return;
  }

  deps.targetDocument.removeEventListener('mousedown', state.activeSelection.onMouseDown);
  deps.targetDocument.removeEventListener('mousemove', state.activeSelection.onMouseMove);
  deps.targetDocument.removeEventListener('mouseup', state.activeSelection.onMouseUp);
  deps.clearScheduledTimeout(state.activeSelection.timeoutId);
  state.activeSelection = null;
  state.isSelecting = false;
}

function createAreaSelectionCleanup(state: AreaSelectionState, deps: AreaSelectionRuntimeDeps) {
  return () => {
    clearActiveAreaSelection(state, deps);
    state.onAreaSelectedCallback = null;
  };
}

function getSelectionElement(
  state: AreaSelectionState,
  createOverlay: typeof createSelectionElement
) {
  if (!state.selectionElement) {
    state.selectionElement = createOverlay();
  }

  return state.selectionElement;
}

function createAreaSelectionMouseDownHandler(
  state: AreaSelectionState,
  deps: Pick<AreaSelectionRuntimeDeps, 'createSelectionElement' | 'removeAreaSelectionTooltip'>
) {
  return (event: MouseEvent) => {
    if (state.isSelecting) {
      return;
    }

    state.startX = event.clientX;
    state.startY = event.clientY;
    state.isSelecting = true;

    const selectionElement = getSelectionElement(state, deps.createSelectionElement);
    selectionElement.style.left = `${state.startX}px`;
    selectionElement.style.top = `${state.startY}px`;
    selectionElement.style.width = '0px';
    selectionElement.style.height = '0px';
    selectionElement.style.display = 'block';
    deps.removeAreaSelectionTooltip();
  };
}

function createAreaSelectionMouseMoveHandler(
  state: AreaSelectionState,
  deps: Pick<AreaSelectionRuntimeDeps, 'updateSelectionBox'>
) {
  return (event: MouseEvent) => {
    if (!state.isSelecting || !state.selectionElement) {
      return;
    }

    deps.updateSelectionBox(
      state.selectionElement,
      { startX: state.startX, startY: state.startY },
      { x: event.clientX, y: event.clientY }
    );
  };
}

function createAreaSelectionMouseUpHandler(
  state: AreaSelectionState,
  deps: Pick<
    AreaSelectionRuntimeDeps,
    'completeAreaSelection' | 'hideSelectionElement' | 'removeAreaSelectionTooltip'
  >,
  cleanup: () => void,
  reject: (reason?: unknown) => void
) {
  return (event: MouseEvent) => {
    if (!state.isSelecting) {
      return;
    }

    state.isSelecting = false;
    deps.hideSelectionElement(state.selectionElement);
    deps.removeAreaSelectionTooltip();
    deps.completeAreaSelection({
      callback: state.onAreaSelectedCallback,
      cleanup,
      endX: event.clientX,
      endY: event.clientY,
      reject,
      startX: state.startX,
      startY: state.startY,
    });
  };
}

function createAreaSelectionHandlers(props: {
  cleanup: () => void;
  deps: AreaSelectionRuntimeDeps;
  reject: (reason?: unknown) => void;
  state: AreaSelectionState;
}) {
  const { cleanup, deps, reject, state } = props;

  return {
    onMouseDown: createAreaSelectionMouseDownHandler(state, deps),
    onMouseMove: createAreaSelectionMouseMoveHandler(state, deps),
    onMouseUp: createAreaSelectionMouseUpHandler(state, deps, cleanup, reject),
  };
}

export function createStartAreaSelection(
  state: AreaSelectionState,
  deps: AreaSelectionRuntimeDeps
) {
  const cleanup = createAreaSelectionCleanup(state, deps);

  return () =>
    new Promise<SelectedArea>((resolve, reject) => {
      logger.log('Starting area selection');
      cleanup();
      getSelectionElement(state, deps.createSelectionElement);
      state.onAreaSelectedCallback = resolve;
      deps.showAreaSelectionTooltip();

      const { onMouseDown, onMouseMove, onMouseUp } = createAreaSelectionHandlers({
        cleanup,
        deps,
        reject,
        state,
      });
      const timeoutId = deps.scheduleTimeout(() => {
        const wasSelecting = state.isSelecting;
        state.isSelecting = false;
        deps.handleAreaSelectionTimeout({
          cleanup,
          isSelecting: wasSelecting,
          reject,
          selectionElement: state.selectionElement,
        });
      }, 30000);

      state.activeSelection = { onMouseDown, onMouseMove, onMouseUp, timeoutId };
      deps.targetDocument.addEventListener('mousedown', onMouseDown);
      deps.targetDocument.addEventListener('mousemove', onMouseMove);
      deps.targetDocument.addEventListener('mouseup', onMouseUp);
    });
}

function removeSelectionElement(state: AreaSelectionState) {
  if (!state.selectionElement) {
    return;
  }

  state.selectionElement.remove();
  state.selectionElement = null;
}

export function createStopAreaSelection(
  state: AreaSelectionState,
  deps: Pick<
    AreaSelectionRuntimeDeps,
    'clearScheduledTimeout' | 'removeAreaSelectionTooltip' | 'targetDocument'
  >
) {
  return () => {
    logger.log('Stopping area selection');
    clearActiveAreaSelection(state, deps);
    state.onAreaSelectedCallback = null;
    deps.removeAreaSelectionTooltip();
    removeSelectionElement(state);
  };
}
