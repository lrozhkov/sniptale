import { disableNavigationLock } from '../../../locker';
import { logSelectionModeDiag, logSelectionModeError } from '../../diag';
import type { SelectionModeSession } from '../../session';
import type { SelectionModeRuntimeActionsArgs } from '../../runtime/setup';
import {
  constrainSelectionModeSelection,
  finalizeSelectionModeDragSelection,
  handleSelectionModeDragMove,
  handleSelectionModeResizeMove,
  hideSelectionModeHoverFrame,
  resetSelectionModeToIdleState,
  selectSelectionModeElement,
  showSelectionModeHoverFrame,
  startSelectionModeDragSelection,
  updateSelectionModeDragSelection,
  updateSelectionModeFinalFrame,
} from '../../runtime/drag';
import { buildSelectionCaptureArea } from '../../runtime/capture-area';
import { cleanupSelectionModeRuntime } from '../../runtime/cleanup';
import { isSelectionModeExtensionUiElement } from '../../runtime/extension-ui';
import { closeSelectionCaptureActionMenu } from '../../ui/final-elements/capture-menu';

type SelectionModeEventsBridgeRuntimeArgs = SelectionModeRuntimeActionsArgs & {
  state: SelectionModeSession;
};

type SelectionModeEventsBridgeArgs = {
  cleanupEvent: () => void;
  disableCursor: () => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  runtimeArgs: SelectionModeEventsBridgeRuntimeArgs;
};

export function createSelectionModeEventsBridge(args: SelectionModeEventsBridgeArgs) {
  const confirmSelection = createSelectionModeConfirmSelection(args);
  const cancelSelection = createSelectionModeCancelSelection(args);
  const cleanup = createSelectionModeCleanup(args);
  return {
    cancelSelection,
    cleanup,
    confirmSelection,
    ...createSelectionModeRuntimeEventActions(args.runtimeArgs),
  };
}

function createSelectionModeConfirmSelection(args: SelectionModeEventsBridgeArgs) {
  return (event?: Event) => {
    const area = buildSelectionCaptureArea(args.runtimeArgs.state.currentSelection);
    const resolveCallback = args.runtimeArgs.state.resolveCallback;

    logSelectionModeDiag('confirmSelection.start', {
      area,
      hasResolveCallback: Boolean(resolveCallback),
    });

    try {
      if (event) {
        args.runtimeArgs.state.onConfirmEvent?.(event);
      }
      args.cleanupEvent();
      logSelectionModeDiag('confirmSelection.after-cleanup');
      disableNavigationLock();
      logSelectionModeDiag('confirmSelection.after-disableNavigationLock');
      resolveCallback?.(area);
      logSelectionModeDiag('confirmSelection.after-resolve', {
        didResolve: Boolean(resolveCallback),
      });
    } catch (error) {
      logSelectionModeError('confirmSelection.failed', error);
      throw error;
    }
  };
}

function createSelectionModeCancelSelection(args: SelectionModeEventsBridgeArgs) {
  return () => {
    const rejectCallback = args.runtimeArgs.state.rejectCallback;

    logSelectionModeDiag('cancelSelection.start', {
      hasRejectCallback: Boolean(rejectCallback),
    });

    try {
      args.cleanupEvent();
      logSelectionModeDiag('cancelSelection.after-cleanup');
      disableNavigationLock();
      logSelectionModeDiag('cancelSelection.after-disableNavigationLock');
      rejectCallback?.(new Error('Cancelled by user'));
      logSelectionModeDiag('cancelSelection.after-reject', {
        didReject: Boolean(rejectCallback),
      });
    } catch (error) {
      logSelectionModeError('cancelSelection.failed', error);
      throw error;
    }
  };
}

function createSelectionModeCleanup(args: SelectionModeEventsBridgeArgs) {
  return () => {
    args.disableCursor();
    const runtimeState: SelectionModeEventsBridgeRuntimeArgs['state'] = args.runtimeArgs.state;
    cleanupSelectionModeRuntime(runtimeState, args.handleKeyDown);
  };
}

function createSelectionModeRuntimeEventActions(runtimeArgs: SelectionModeEventsBridgeRuntimeArgs) {
  return {
    closeCaptureActionMenu(restoreFocus: boolean) {
      return closeSelectionCaptureActionMenu(runtimeArgs.state.dom.overlayContainer, restoreFocus);
    },
    constrainSelection() {
      constrainSelectionModeSelection(runtimeArgs);
    },
    finalizeDragSelection() {
      finalizeSelectionModeDragSelection(runtimeArgs);
    },
    flushFinalFrameUpdate() {
      runtimeArgs.flushFinalFrameUpdate();
    },
    handleDragMove(event: MouseEvent) {
      handleSelectionModeDragMove(runtimeArgs, event);
    },
    handleResizeMove(event: MouseEvent) {
      handleSelectionModeResizeMove(runtimeArgs, event);
    },
    hideHoverFrame() {
      hideSelectionModeHoverFrame(runtimeArgs);
    },
    isExtensionUIElement(target: HTMLElement) {
      return isSelectionModeExtensionUiElement(target);
    },
    resetToIdleState() {
      resetSelectionModeToIdleState(runtimeArgs);
    },
    selectElement(element: HTMLElement, iframe?: HTMLIFrameElement) {
      void iframe;
      selectSelectionModeElement(runtimeArgs, element);
    },
    showHoverFrame(element: HTMLElement, iframe?: HTMLIFrameElement) {
      void iframe;
      showSelectionModeHoverFrame(runtimeArgs, element);
    },
    startDragSelection(startX: number, startY: number) {
      startSelectionModeDragSelection(runtimeArgs, startX, startY);
    },
    updateDragSelection(currentX: number, currentY: number) {
      updateSelectionModeDragSelection(runtimeArgs, currentX, currentY);
    },
    updateFinalFrame() {
      updateSelectionModeFinalFrame(runtimeArgs);
    },
  };
}
