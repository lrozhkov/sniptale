import type { SelectedArea } from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { translate } from '../../../platform/i18n';
import type { AreaSelectionResultOwner } from './result';
import type { AreaSelectionSurface } from './surface';

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
  result: AreaSelectionResultOwner;
  scheduleTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  surface: AreaSelectionSurface;
  targetDocument: Document;
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
  surface: Pick<AreaSelectionSurface, 'createSelectionElement'>
) {
  if (!state.selectionElement) {
    state.selectionElement = surface.createSelectionElement();
  }

  return state.selectionElement;
}

function createAreaSelectionMouseDownHandler(
  state: AreaSelectionState,
  surface: AreaSelectionSurface
) {
  return (event: MouseEvent) => {
    if (state.isSelecting) {
      return;
    }

    state.startX = event.clientX;
    state.startY = event.clientY;
    state.isSelecting = true;

    const selectionElement = getSelectionElement(state, surface);
    surface.showSelectionElement(selectionElement, {
      startX: state.startX,
      startY: state.startY,
    });
    surface.removeSelectionTooltip();
  };
}

function createAreaSelectionMouseMoveHandler(
  state: AreaSelectionState,
  surface: Pick<AreaSelectionSurface, 'updateSelectionBox'>
) {
  return (event: MouseEvent) => {
    if (!state.isSelecting || !state.selectionElement) {
      return;
    }

    surface.updateSelectionBox(
      state.selectionElement,
      { startX: state.startX, startY: state.startY },
      { x: event.clientX, y: event.clientY }
    );
  };
}

function createAreaSelectionMouseUpHandler(
  state: AreaSelectionState,
  deps: Pick<AreaSelectionRuntimeDeps, 'result' | 'surface'>,
  cleanup: () => void,
  reject: (reason?: unknown) => void
) {
  return (event: MouseEvent) => {
    if (!state.isSelecting) {
      return;
    }

    state.isSelecting = false;
    deps.surface.hideSelectionElement(state.selectionElement);
    deps.surface.removeSelectionTooltip();
    const result = deps.result.createSelectionResult({
      endX: event.clientX,
      endY: event.clientY,
      startX: state.startX,
      startY: state.startY,
    });
    if (result.error) {
      reject(result.error);
      cleanup();
      return;
    }

    state.onAreaSelectedCallback?.(result.area);
    cleanup();
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
    onMouseDown: createAreaSelectionMouseDownHandler(state, deps.surface),
    onMouseMove: createAreaSelectionMouseMoveHandler(state, deps.surface),
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
      getSelectionElement(state, deps.surface);
      state.onAreaSelectedCallback = resolve;
      deps.surface.showSelectionTooltip();

      const { onMouseDown, onMouseMove, onMouseUp } = createAreaSelectionHandlers({
        cleanup,
        deps,
        reject,
        state,
      });
      const timeoutId = deps.scheduleTimeout(() => {
        const wasSelecting = state.isSelecting;
        state.isSelecting = false;
        if (!wasSelecting) {
          return;
        }

        deps.surface.hideSelectionElement(state.selectionElement);
        deps.surface.removeSelectionTooltip();
        reject(new Error(translate('content.runtime.areaSelectTimeout')));
        cleanup();
      }, 30000);

      state.activeSelection = { onMouseDown, onMouseMove, onMouseUp, timeoutId };
      deps.targetDocument.addEventListener('mousedown', onMouseDown);
      deps.targetDocument.addEventListener('mousemove', onMouseMove);
      deps.targetDocument.addEventListener('mouseup', onMouseUp);
    });
}

function removeSelectionElement(
  state: AreaSelectionState,
  surface: Pick<AreaSelectionSurface, 'removeSelectionElement'>
) {
  if (!state.selectionElement) {
    return;
  }

  surface.removeSelectionElement(state.selectionElement);
  state.selectionElement = null;
}

export function createStopAreaSelection(
  state: AreaSelectionState,
  deps: Pick<AreaSelectionRuntimeDeps, 'clearScheduledTimeout' | 'surface' | 'targetDocument'>
) {
  return () => {
    logger.log('Stopping area selection');
    clearActiveAreaSelection(state, deps);
    state.onAreaSelectedCallback = null;
    deps.surface.removeSelectionTooltip();
    removeSelectionElement(state, deps.surface);
  };
}
