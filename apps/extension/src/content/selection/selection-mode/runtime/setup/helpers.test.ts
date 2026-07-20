// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { SelectionModeMutableRefs } from '../../session/locals-contract';
import {
  applySelectionModeMutableRefSetters,
  createSelectionModeMutableRefGetters,
} from './helpers';
import type { SelectionState } from '../../types';
import type { ResizeDirection } from '../../ui/dom-types';
import { createSelectionModeDom } from '../../ui';

interface MutableRefState {
  aspectRatio: number | null;
  cleanupEventListeners: (() => void) | null;
  cleanupScrollListeners: (() => void) | null;
  currentSelection: { x: number; y: number; width: number; height: number };
  currentState: SelectionState;
  dom: ReturnType<typeof createSelectionModeDom>;
  dragStartPoint: { x: number; y: number };
  dragThreshold: number;
  hasMovedEnough: boolean;
  hoveredElement: HTMLElement | null;
  isActive: boolean;
  isDragging: boolean;
  isResizing: boolean;
  maintainAspectRatio: boolean;
  mouseDownPoint: { x: number; y: number } | null;
  resizeDirection: ResizeDirection | null;
  selectionAtDragStart: { x: number; y: number; width: number; height: number };
  skipNextClick: boolean;
}

function createMutableRefState(): MutableRefState {
  return {
    aspectRatio: 4 / 3,
    cleanupEventListeners: vi.fn(),
    cleanupScrollListeners: vi.fn(),
    currentSelection: { x: 10, y: 20, width: 300, height: 200 },
    currentState: 'drag',
    dom: createSelectionModeDom(),
    dragStartPoint: { x: 1, y: 2 },
    dragThreshold: 5,
    hasMovedEnough: false,
    hoveredElement: document.createElement('div'),
    isActive: true,
    isDragging: true,
    isResizing: false,
    maintainAspectRatio: true,
    mouseDownPoint: { x: 3, y: 4 },
    resizeDirection: 'se',
    selectionAtDragStart: { x: 0, y: 0, width: 100, height: 80 },
    skipNextClick: false,
  };
}

function createMutableRefGetterArgs(state: MutableRefState) {
  return {
    getAspectRatio: () => state.aspectRatio,
    getCleanupEventListeners: () => state.cleanupEventListeners,
    getCleanupScrollListeners: () => state.cleanupScrollListeners,
    getCurrentSelection: () => state.currentSelection,
    getCurrentState: () => state.currentState,
    getDom: () => state.dom,
    getDragStartPoint: () => state.dragStartPoint,
    getDragThreshold: () => state.dragThreshold,
    getHasMovedEnough: () => state.hasMovedEnough,
    getHoveredElement: () => state.hoveredElement,
    getIsActive: () => state.isActive,
    getIsDragging: () => state.isDragging,
    getIsResizing: () => state.isResizing,
    getMaintainAspectRatio: () => state.maintainAspectRatio,
    getMouseDownPoint: () => state.mouseDownPoint,
    getResizeDirection: () => state.resizeDirection,
    getSelectionAtDragStart: () => state.selectionAtDragStart,
    getSkipNextClick: () => state.skipNextClick,
  };
}

function createMutableRefCoreSetterArgs(state: MutableRefState) {
  return {
    setAspectRatio: (value: number | null) => {
      state.aspectRatio = value;
    },
    setCleanupEventListeners: (value: (() => void) | null) => {
      state.cleanupEventListeners = value;
    },
    setCleanupScrollListeners: (value: (() => void) | null) => {
      state.cleanupScrollListeners = value;
    },
    setCurrentSelection: (value: MutableRefState['currentSelection']) => {
      state.currentSelection = value;
    },
    setCurrentState: (value: MutableRefState['currentState']) => {
      state.currentState = value;
    },
    setDom: (value: MutableRefState['dom']) => {
      state.dom = value;
    },
  };
}

function createMutableRefInteractionSetterArgs(state: MutableRefState) {
  return {
    setDragStartPoint: (value: MutableRefState['dragStartPoint']) => {
      state.dragStartPoint = value;
    },
    setDragThreshold: (value: number) => {
      state.dragThreshold = value;
    },
    setHasMovedEnough: (value: boolean) => {
      state.hasMovedEnough = value;
    },
    setHoveredElement: (value: HTMLElement | null) => {
      state.hoveredElement = value;
    },
    setIsActive: (value: boolean) => {
      state.isActive = value;
    },
    setIsDragging: (value: boolean) => {
      state.isDragging = value;
    },
    setIsResizing: (value: boolean) => {
      state.isResizing = value;
    },
    setMaintainAspectRatio: (value: boolean) => {
      state.maintainAspectRatio = value;
    },
    setMouseDownPoint: (value: MutableRefState['mouseDownPoint']) => {
      state.mouseDownPoint = value;
    },
    setResizeDirection: (value: MutableRefState['resizeDirection']) => {
      state.resizeDirection = value;
    },
    setSelectionAtDragStart: (value: MutableRefState['selectionAtDragStart']) => {
      state.selectionAtDragStart = value;
    },
    setSkipNextClick: (value: boolean) => {
      state.skipNextClick = value;
    },
  };
}

function createMutableRefArgs(state: MutableRefState) {
  return {
    ...createMutableRefGetterArgs(state),
    ...createMutableRefCoreSetterArgs(state),
    ...createMutableRefInteractionSetterArgs(state),
  };
}

function readMutableRefsSnapshot(refs: SelectionModeMutableRefs) {
  return {
    aspectRatio: refs.aspectRatio,
    cleanupEventListeners: refs.cleanupEventListeners,
    cleanupScrollListeners: refs.cleanupScrollListeners,
    currentSelection: refs.currentSelection,
    currentState: refs.currentState,
    dom: refs.dom,
    dragStartPoint: refs.dragStartPoint,
    dragThreshold: refs.dragThreshold,
    hasMovedEnough: refs.hasMovedEnough,
    hoveredElement: refs.hoveredElement,
    isActive: refs.isActive,
    isDragging: refs.isDragging,
    isResizing: refs.isResizing,
    maintainAspectRatio: refs.maintainAspectRatio,
    mouseDownPoint: refs.mouseDownPoint,
    resizeDirection: refs.resizeDirection,
    selectionAtDragStart: refs.selectionAtDragStart,
    skipNextClick: refs.skipNextClick,
  };
}

function mutateMutableRefState(state: MutableRefState) {
  state.aspectRatio = null;
  state.currentState = 'confirmed';
  state.currentSelection = { x: 40, y: 50, width: 320, height: 180 };
  state.dragThreshold = 9;
  state.hasMovedEnough = true;
  state.hoveredElement = null;
  state.isDragging = false;
  state.isResizing = true;
  state.maintainAspectRatio = false;
  state.mouseDownPoint = null;
  state.resizeDirection = 'nw';
  state.skipNextClick = true;
}

function applyMutableRefUpdates(refs: SelectionModeMutableRefs) {
  const cleanupEventListeners = vi.fn();
  const cleanupScrollListeners = vi.fn();
  const dom = createSelectionModeDom();
  const hoveredElement = document.createElement('section');

  refs.aspectRatio = null;
  refs.cleanupEventListeners = cleanupEventListeners;
  refs.cleanupScrollListeners = cleanupScrollListeners;
  refs.currentSelection = { x: 1, y: 2, width: 3, height: 4 };
  refs.currentState = 'confirmed';
  refs.dom = dom;
  refs.dragStartPoint = { x: 5, y: 6 };
  refs.dragThreshold = 11;
  refs.hasMovedEnough = true;
  refs.hoveredElement = hoveredElement;
  refs.isActive = false;
  refs.isDragging = false;
  refs.isResizing = true;
  refs.maintainAspectRatio = false;
  refs.mouseDownPoint = null;
  refs.resizeDirection = 'nw';
  refs.selectionAtDragStart = { x: 7, y: 8, width: 9, height: 10 };
  refs.skipNextClick = true;

  return { cleanupEventListeners, cleanupScrollListeners, dom, hoveredElement };
}

function expectLiveGetterBackedRefs() {
  const state = createMutableRefState();
  const refs = createSelectionModeMutableRefGetters(
    createMutableRefArgs(state)
  ) as SelectionModeMutableRefs;

  expect(readMutableRefsSnapshot(refs)).toEqual(state);
  mutateMutableRefState(state);
  expect(readMutableRefsSnapshot(refs)).toEqual(state);
}

function expectSetterBackedRefs() {
  const state = createMutableRefState();
  const refs = applySelectionModeMutableRefSetters(
    createSelectionModeMutableRefGetters(createMutableRefArgs(state)) as SelectionModeMutableRefs,
    createMutableRefArgs(state)
  );
  const appliedValues = applyMutableRefUpdates(refs);

  expect(state).toEqual({
    aspectRatio: null,
    cleanupEventListeners: appliedValues.cleanupEventListeners,
    cleanupScrollListeners: appliedValues.cleanupScrollListeners,
    currentSelection: { x: 1, y: 2, width: 3, height: 4 },
    currentState: 'confirmed',
    dom: appliedValues.dom,
    dragStartPoint: { x: 5, y: 6 },
    dragThreshold: 11,
    hasMovedEnough: true,
    hoveredElement: appliedValues.hoveredElement,
    isActive: false,
    isDragging: false,
    isResizing: true,
    maintainAspectRatio: false,
    mouseDownPoint: null,
    resizeDirection: 'nw',
    selectionAtDragStart: { x: 7, y: 8, width: 9, height: 10 },
    skipNextClick: true,
  });
}

function runRuntimeSetupHelpersSuite() {
  it('exposes live getter-backed mutable refs for the runtime state', expectLiveGetterBackedRefs);
  it('applies setter-backed mutable refs to the runtime owner state', expectSetterBackedRefs);
}

describe('selection-mode runtime setup helpers', runRuntimeSetupHelpersSuite);
