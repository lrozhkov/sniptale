import { vi } from 'vitest';
import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import type { SelectionModeState } from '../session/state';

export function createSelectionModeStateMock(): SelectionModeState {
  return {
    aspectRatio: null,
    cleanupEventListeners: null,
    cleanupScrollListeners: null,
    currentSelection: { x: 0, y: 0, width: 0, height: 0 },
    currentState: 'idle',
    cursorStyleCleanup: null,
    dom: {} as SelectionModeState['dom'],
    dragStartPoint: { x: 0, y: 0 },
    dragThreshold: 5,
    hasMovedEnough: false,
    hoveredElement: null,
    isActive: false,
    isDragging: false,
    isResizing: false,
    maintainAspectRatio: false,
    mouseDownPoint: null,
    rejectCallback: null,
    resizeDirection: null,
    resolveCallback: null,
    selectionAtDragStart: { x: 0, y: 0, width: 0, height: 0 },
    skipNextClick: false,
  };
}

export function createSelectionModeEventsMock() {
  return {
    cancelSelection: vi.fn(),
    cleanup: vi.fn(),
    confirmSelection: vi.fn(),
    constrainSelection: vi.fn(),
    resetToIdleState: vi.fn(),
    updateFinalFrame: vi.fn(),
  };
}

export function createSelectionModeRuntimeFacadeMock() {
  return {
    disableCursor: vi.fn(),
    disableSelectionMode: vi.fn(),
    enableSelectionMode: vi.fn<() => Promise<CaptureArea>>(),
    isSelectionModeActive: vi.fn<() => boolean>(),
    uiRuntime: {
      createDragFrame: vi.fn(),
      createFinalElements: vi.fn(),
    },
  };
}

function createCapturedFacadeEventBindings(args: {
  getRuntimeEvents: () => {
    confirmSelection: () => void;
    cancelSelection: () => void;
    constrainSelection: () => void;
    resetToIdleState: () => void;
    updateFinalFrame: () => void;
  };
}) {
  return {
    cancelSelection: () => {
      args.getRuntimeEvents().cancelSelection();
    },
    confirmSelection: () => {
      args.getRuntimeEvents().confirmSelection();
    },
    constrainSelection: () => {
      args.getRuntimeEvents().constrainSelection();
    },
    resetToIdleState: () => {
      args.getRuntimeEvents().resetToIdleState();
    },
    updateFinalFrame: () => {
      args.getRuntimeEvents().updateFinalFrame();
    },
  };
}

function createCapturedFacadeSessionBindings(
  session: Pick<
    SelectionModeState,
    | 'aspectRatio'
    | 'currentSelection'
    | 'currentState'
    | 'isActive'
    | 'maintainAspectRatio'
    | 'rejectCallback'
    | 'resolveCallback'
  >
) {
  return {
    getAspectRatio: () => session.aspectRatio,
    getCurrentSelection: () => session.currentSelection,
    getIsActive: () => session.isActive,
    getMaintainAspectRatio: () => session.maintainAspectRatio,
    getRejectCallback: () => session.rejectCallback,
    setAspectRatio: (value: number | null) => {
      session.aspectRatio = value;
    },
    setCurrentSelection: (value: SelectionModeState['currentSelection']) => {
      session.currentSelection = value;
    },
    setCurrentState: (value: SelectionModeState['currentState']) => {
      session.currentState = value;
    },
    setIsActive: (value: boolean) => {
      session.isActive = value;
    },
    setMaintainAspectRatio: (value: boolean) => {
      session.maintainAspectRatio = value;
    },
    setRejectCallback: (value: SelectionModeState['rejectCallback']) => {
      session.rejectCallback = value;
    },
    setResolveCallback: (value: SelectionModeState['resolveCallback']) => {
      session.resolveCallback = value;
    },
  };
}

export function createCapturedFacadeBindingsBase(args: {
  getRuntimeArgs: () => { state: unknown };
  getRuntimeEvents: () => {
    confirmSelection: () => void;
    cancelSelection: () => void;
    constrainSelection: () => void;
    resetToIdleState: () => void;
    updateFinalFrame: () => void;
  };
  session: Pick<
    SelectionModeState,
    | 'aspectRatio'
    | 'currentSelection'
    | 'currentState'
    | 'isActive'
    | 'maintainAspectRatio'
    | 'rejectCallback'
    | 'resolveCallback'
  >;
}) {
  return {
    ...createCapturedFacadeEventBindings({ getRuntimeEvents: args.getRuntimeEvents }),
    ...createCapturedFacadeSessionBindings(args.session),
  };
}

export function createCapturedRuntimeGraphBindingsArgs(args: {
  runtimeFacade: { disableCursor: () => void };
  session: Pick<
    SelectionModeState,
    | 'cleanupEventListeners'
    | 'cleanupScrollListeners'
    | 'currentSelection'
    | 'rejectCallback'
    | 'resolveCallback'
  >;
  updateFinalFrame: () => void;
}) {
  return {
    currentSelection: () => args.session.currentSelection,
    disableCursor: () => {
      args.runtimeFacade.disableCursor();
    },
    getRejectCallback: () => args.session.rejectCallback,
    getResolveCallback: () => args.session.resolveCallback,
    setCleanupEventListeners: (cleanup: (() => void) | null) => {
      args.session.cleanupEventListeners = cleanup;
    },
    setCleanupScrollListeners: (cleanup: (() => void) | null) => {
      args.session.cleanupScrollListeners = cleanup;
    },
    updateFinalFrame: args.updateFinalFrame,
  };
}
