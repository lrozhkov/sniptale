import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { createSelectionModeDom } from '../ui';
import type { SelectionModeDom, ResizeDirection } from '../ui/dom-types';
import type { Point, Selection, SelectionState } from '../types';

interface SelectionModeLifecycleState {
  isActive: boolean;
  currentState: SelectionState;
  currentSelection: Selection;
  aspectRatio: number | null;
  maintainAspectRatio: boolean;
}

interface SelectionModeDomState {
  dom: SelectionModeDom;
  cleanupEventListeners: (() => void) | null;
  cleanupScrollListeners: (() => void) | null;
  hoveredElement: HTMLElement | null;
  cursorStyleCleanup: (() => void) | null;
}

interface SelectionModeInteractionState {
  isDragging: boolean;
  isResizing: boolean;
  resizeDirection: ResizeDirection | null;
  dragStartPoint: Point;
  selectionAtDragStart: Selection;
  dragThreshold: number;
  mouseDownPoint: Point | null;
  hasMovedEnough: boolean;
  skipNextClick: boolean;
}

interface SelectionModePromiseState {
  resolveCallback: ((area: CaptureArea) => void) | null;
  rejectCallback: ((error: Error) => void) | null;
}

export type SelectionModeState = SelectionModeLifecycleState &
  SelectionModeDomState &
  SelectionModeInteractionState &
  SelectionModePromiseState;

export function createSelectionModeState(): SelectionModeState {
  return {
    ...createSelectionModeLifecycleState(),
    ...createSelectionModeDomState(),
    ...createSelectionModeInteractionState(),
    ...createSelectionModePromiseState(),
  };
}

function createSelectionModeLifecycleState(): SelectionModeLifecycleState {
  return {
    isActive: false,
    currentState: 'idle',
    currentSelection: { x: 0, y: 0, width: 0, height: 0 },
    aspectRatio: null,
    maintainAspectRatio: false,
  };
}

function createSelectionModeDomState(): SelectionModeDomState {
  return {
    dom: createSelectionModeDom(),
    cleanupEventListeners: null,
    cleanupScrollListeners: null,
    hoveredElement: null,
    cursorStyleCleanup: null,
  };
}

function createSelectionModeInteractionState(): SelectionModeInteractionState {
  return {
    isDragging: false,
    isResizing: false,
    resizeDirection: null,
    dragStartPoint: { x: 0, y: 0 },
    selectionAtDragStart: { x: 0, y: 0, width: 0, height: 0 },
    dragThreshold: 5,
    mouseDownPoint: null,
    hasMovedEnough: false,
    skipNextClick: false,
  };
}

function createSelectionModePromiseState(): SelectionModePromiseState {
  return {
    resolveCallback: null,
    rejectCallback: null,
  };
}
