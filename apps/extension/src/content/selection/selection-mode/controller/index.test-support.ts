import { vi } from 'vitest';
import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import type { SelectionModeSession } from '../session';

export function createSelectionModeSessionMock(): SelectionModeSession {
  return {
    aspectRatio: null,
    cleanupEventListeners: null,
    cleanupScrollListeners: null,
    currentSelection: { x: 0, y: 0, width: 0, height: 0 },
    currentState: 'idle',
    cursorStyleCleanup: null,
    dom: {} as SelectionModeSession['dom'],
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

export function createCapturedRuntimeGraphBindingsArgs(args: {
  runtimeFacade: { disableCursor: () => void };
  session: Pick<
    SelectionModeSession,
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
    session: args.session,
    updateFinalFrame: args.updateFinalFrame,
  };
}
