import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { createSelectionModeDom } from '../ui/container';
import type { ResizeDirection, SelectionModeDom } from '../ui/dom-types';
import type { Point, Selection, SelectionState } from '../types';

export interface SelectionModeSession {
  aspectRatio: number | null;
  cleanupEventListeners: (() => void) | null;
  cleanupScrollListeners: (() => void) | null;
  currentSelection: Selection;
  currentState: SelectionState;
  cursorStyleCleanup: (() => void) | null;
  dom: SelectionModeDom;
  dragStartPoint: Point;
  dragThreshold: number;
  hasMovedEnough: boolean;
  hoveredElement: HTMLElement | null;
  isActive: boolean;
  isDragging: boolean;
  isResizing: boolean;
  maintainAspectRatio: boolean;
  mouseDownPoint: Point | null;
  rejectCallback: ((error: Error) => void) | null;
  resizeDirection: ResizeDirection | null;
  resolveCallback: ((area: CaptureArea) => void) | null;
  selectionAtDragStart: Selection;
  skipNextClick: boolean;
}

/**
 * Creates the single mutable state authority for one selection-mode controller instance.
 */
export function createSelectionModeSession(): SelectionModeSession {
  return {
    aspectRatio: null,
    cleanupEventListeners: null,
    cleanupScrollListeners: null,
    currentSelection: emptySelection(),
    currentState: 'idle',
    cursorStyleCleanup: null,
    dom: createSelectionModeDom(),
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
    selectionAtDragStart: emptySelection(),
    skipNextClick: false,
  };
}

/**
 * Resets mutable session locals back to the idle selection-mode baseline.
 */
export function resetSelectionModeSession(session: SelectionModeSession): void {
  Object.assign(session, {
    aspectRatio: null,
    cleanupEventListeners: null,
    cleanupScrollListeners: null,
    currentSelection: emptySelection(),
    currentState: 'idle',
    dragStartPoint: { x: 0, y: 0 },
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
    selectionAtDragStart: emptySelection(),
    skipNextClick: false,
  } satisfies Partial<SelectionModeSession>);
}

function emptySelection(): Selection {
  return { x: 0, y: 0, width: 0, height: 0 };
}
