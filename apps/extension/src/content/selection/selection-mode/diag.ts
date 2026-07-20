import { createLogger } from '@sniptale/platform/observability/logger';
import type { SelectionModeMutableRefs } from './session/locals-contract';

const diagLogger = createLogger({ namespace: 'ContentSelectionMode:Diag' });
const runtimeLogger = createLogger({ namespace: 'ContentSelectionMode:Runtime' });

type SelectionModeInteractionState = Pick<
  SelectionModeMutableRefs,
  | 'currentSelection'
  | 'isDragging'
  | 'isResizing'
  | 'mouseDownPoint'
  | 'resizeDirection'
  | 'selectionAtDragStart'
>;

export function logSelectionModeDiag(event: string, details?: Record<string, unknown>): void {
  diagLogger.debug(event, details ?? {});
}

export function logSelectionModeRuntime(event: string, details?: Record<string, unknown>): void {
  runtimeLogger.debug(event, details ?? {});
}

export function logSelectionModeError(event: string, error: unknown): void {
  diagLogger.error(event, error);
}

export function logSelectionModeResizeStart(
  event: MouseEvent,
  state: SelectionModeInteractionState
): void {
  logSelectionModeDiag('resize.start', {
    clientX: event.clientX,
    clientY: event.clientY,
    resizeDirection: state.resizeDirection,
    selectionAtDragStart: state.selectionAtDragStart,
  });
}

export function logSelectionModeDragStart(
  event: MouseEvent,
  state: SelectionModeInteractionState
): void {
  logSelectionModeDiag('drag.start', {
    clientX: event.clientX,
    clientY: event.clientY,
    selectionAtDragStart: state.selectionAtDragStart,
  });
}

export function logSelectionModeDragFinalize(state: SelectionModeInteractionState): void {
  logSelectionModeDiag('drag.finalize-requested', {
    mouseDownPoint: state.mouseDownPoint,
  });
}

export function logSelectionModePointerFinish(state: SelectionModeInteractionState): void {
  logSelectionModeDiag('confirmed.pointer-finish', {
    currentSelection: state.currentSelection,
    isDragging: state.isDragging,
    isResizing: state.isResizing,
    resizeDirection: state.resizeDirection,
  });
}

export function logSelectionModeKeyAction(
  action: 'cancel' | 'confirm',
  state: SelectionModeInteractionState
): void {
  logSelectionModeDiag(`keydown.${action}`, {
    currentSelection: state.currentSelection,
  });
}
