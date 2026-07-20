// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  constrainSelectionStateMock,
  finalizeDragSelectionStateMock,
  handleDragMoveStateMock,
  handleResizeMoveStateMock,
  resetToIdleStateStateMock,
  selectElementStateMock,
  startDragSelectionStateMock,
  updateDragFrameStateMock,
  updateDragSelectionStateMock,
  updateFinalFrameStateMock,
} = vi.hoisted(() => ({
  constrainSelectionStateMock: vi.fn(),
  finalizeDragSelectionStateMock: vi.fn(),
  handleDragMoveStateMock: vi.fn(),
  handleResizeMoveStateMock: vi.fn(),
  resetToIdleStateStateMock: vi.fn(),
  selectElementStateMock: vi.fn(),
  startDragSelectionStateMock: vi.fn(),
  updateDragFrameStateMock: vi.fn(),
  updateDragSelectionStateMock: vi.fn(),
  updateFinalFrameStateMock: vi.fn(),
}));

vi.mock('../selection', () => ({
  constrainSelection: constrainSelectionStateMock,
  finalizeDragSelection: finalizeDragSelectionStateMock,
  handleDragMove: handleDragMoveStateMock,
  handleResizeMove: handleResizeMoveStateMock,
  resetToIdleState: resetToIdleStateStateMock,
  selectElement: selectElementStateMock,
  startDragSelection: startDragSelectionStateMock,
  updateDragFrame: updateDragFrameStateMock,
  updateDragSelection: updateDragSelectionStateMock,
  updateFinalFrame: updateFinalFrameStateMock,
}));

import { applySelectionModeDragSelection, applySelectionModeElementSelection } from '.';
import type { SelectionModeDom } from '../../ui/dom-types';

function createDom(): SelectionModeDom {
  return {
    overlayContainer: null,
    hoverFrame: null,
    scissorsIcon: null,
    hoverSizeLabel: null,
    dragFrame: null,
    finalFrame: null,
    finalOverlay: null,
    sizePanel: null,
    sizeTooltip: null,
    widthInput: null,
    heightInput: null,
    aspectRatioButton: null,
    cancelButton: null,
    dragEventCatcher: null,
  };
}

function createDragArgs() {
  return {
    aspectRatio: 2,
    createDragFrame: vi.fn(),
    currentSelection: { x: 10, y: 20, width: 120, height: 80 },
    dom: createDom(),
    dragStartPoint: { x: 15, y: 25 },
    getMaxSelectionHeight: vi.fn(() => 500),
    getMaxSelectionWidth: vi.fn(() => 800),
    maintainAspectRatio: true,
    minSelectionSize: 20,
    resizeDirection: null,
    selectionAtDragStart: { x: 10, y: 20, width: 120, height: 80 },
    zIndexBase: 900,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function registerDragRuntimeDelegationTest() {
  it('delegates drag runtime operations to the interaction helpers', () => {
    const args = createDragArgs();
    const dragRuntime = applySelectionModeDragSelection(args);
    const event = { clientX: 220, clientY: 180 } as MouseEvent;

    dragRuntime.constrainSelection();
    dragRuntime.handleDragMove(event);
    dragRuntime.updateDragSelection(210, 160);
    dragRuntime.updateDragFrame();
    dragRuntime.updateFinalFrame();
    dragRuntime.startDragSelection(40, 60);

    expect(constrainSelectionStateMock).toHaveBeenCalledWith(args.currentSelection);
    expect(handleDragMoveStateMock).toHaveBeenCalledWith(
      args.selectionAtDragStart,
      args.dragStartPoint,
      event
    );
    expect(updateDragSelectionStateMock).toHaveBeenCalledWith(args.dragStartPoint, 210, 160);
    expect(updateDragFrameStateMock).toHaveBeenCalledWith(args.dom, args.currentSelection);
    expect(updateFinalFrameStateMock).toHaveBeenCalledWith(args.dom, args.currentSelection);
    expect(args.createDragFrame).toHaveBeenCalledTimes(1);
    expect(startDragSelectionStateMock).toHaveBeenCalledWith(
      { dom: args.dom, zIndexBase: args.zIndexBase },
      40,
      60
    );
  });
}

function registerResizeFinalizeResetTest() {
  it('passes resize/finalize/reset payloads with the canonical fallback direction', () => {
    const args = createDragArgs();
    const dragRuntime = applySelectionModeDragSelection(args);
    const event = { clientX: 240, clientY: 200 } as MouseEvent;

    dragRuntime.handleResizeMove(event);
    dragRuntime.finalizeDragSelection();
    dragRuntime.resetToIdleState();

    expect(handleResizeMoveStateMock).toHaveBeenCalledWith({
      aspectRatio: args.aspectRatio,
      dragStartPoint: args.dragStartPoint,
      event,
      getMaxSelectionHeight: args.getMaxSelectionHeight,
      getMaxSelectionWidth: args.getMaxSelectionWidth,
      maintainAspectRatio: args.maintainAspectRatio,
      minSelectionSize: args.minSelectionSize,
      resizeDirection: 'se',
      selectionAtDragStart: args.selectionAtDragStart,
    });
    expect(finalizeDragSelectionStateMock).toHaveBeenCalledWith({
      currentSelection: args.currentSelection,
      dom: args.dom,
      minSelectionSize: args.minSelectionSize,
    });
    expect(resetToIdleStateStateMock).toHaveBeenCalledWith(args.dom);
  });
}

function registerElementSelectionTest() {
  it('delegates element selection to the interaction seam', () => {
    const element = document.createElement('div');
    const getAbsolutePosition = vi.fn(() => ({ x: 20, y: 30, width: 200, height: 100 }));

    applySelectionModeElementSelection({
      element,
      getAbsolutePosition,
      getMaxSelectionHeight: () => 400,
      getMaxSelectionWidth: () => 600,
    });

    expect(selectElementStateMock).toHaveBeenCalledWith({
      element,
      getAbsolutePosition,
      getMaxSelectionHeight: expect.any(Function),
      getMaxSelectionWidth: expect.any(Function),
    });
  });
}

describe('selection-mode actions', () => {
  registerDragRuntimeDelegationTest();
  registerResizeFinalizeResetTest();
  registerElementSelectionTest();
});
