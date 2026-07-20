// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SelectionModeDom } from '../../ui/dom-types';

const { handleResizeSelectionMoveMock } = vi.hoisted(() => ({
  handleResizeSelectionMoveMock: vi.fn(),
}));

vi.mock('../selection/helpers', () => ({
  handleResizeSelectionMove: handleResizeSelectionMoveMock,
}));

import * as selectionUi from '../../ui';
import { handleResizeMove, resetToIdleState, updateDragFrame, updateFinalFrame } from '.';

function createDom(): SelectionModeDom {
  return {
    overlayContainer: null,
    hoverFrame: null,
    scissorsIcon: null,
    hoverSizeLabel: null,
    dragFrame: document.createElement('div'),
    finalFrame: document.createElement('div'),
    finalOverlay: document.createElement('div'),
    sizePanel: document.createElement('div'),
    sizeTooltip: document.createElement('div') as never,
    widthInput: document.createElement('input'),
    heightInput: document.createElement('input'),
    aspectRatioButton: document.createElement('button'),
    cancelButton: document.createElement('button'),
    dragEventCatcher: document.createElement('div'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function registerResetTest() {
  it('resets the frame state and delegates element cleanup to the UI seam', () => {
    const dom = createDom();
    const resetFinalElementsSpy = vi
      .spyOn(selectionUi, 'resetFinalElements')
      .mockImplementation(() => {});

    const result = resetToIdleState(dom);

    expect(resetFinalElementsSpy).toHaveBeenCalledWith(dom);
    expect(result).toEqual({
      currentSelection: { x: 0, y: 0, width: 0, height: 0 },
      aspectRatio: null,
      maintainAspectRatio: false,
      isDragging: false,
      isResizing: false,
      resizeDirection: null,
      hoveredElement: null,
      mouseDownPoint: null,
      hasMovedEnough: false,
      currentState: 'idle',
    });
  });
}

function registerUiDelegationTest() {
  it('forwards drag-frame and final-frame updates to the UI helpers', () => {
    const dom = createDom();
    const rect = { x: 20, y: 30, width: 160, height: 90 };
    const updateDragFrameSpy = vi
      .spyOn(selectionUi, 'updateDragFrame')
      .mockImplementation(() => {});
    const updateFinalFrameSpy = vi
      .spyOn(selectionUi, 'updateFinalFrame')
      .mockImplementation(() => {});

    updateDragFrame(dom, rect);
    updateFinalFrame(dom, rect);

    expect(updateDragFrameSpy).toHaveBeenCalledWith(dom, rect);
    expect(updateFinalFrameSpy).toHaveBeenCalledWith(dom, rect);
  });
}

function registerResizeDelegationTest() {
  it('passes resize calculations through the interaction helper', () => {
    const event = { clientX: 280, clientY: 220 } as MouseEvent;
    handleResizeSelectionMoveMock.mockReturnValue({ x: 40, y: 50, width: 200, height: 120 });

    const result = handleResizeMove({
      aspectRatio: 2,
      dragStartPoint: { x: 100, y: 120 },
      event,
      getMaxSelectionHeight: () => 700,
      getMaxSelectionWidth: () => 900,
      maintainAspectRatio: true,
      minSelectionSize: 40,
      resizeDirection: 'se',
      selectionAtDragStart: { x: 30, y: 40, width: 160, height: 80 },
    });

    expect(handleResizeSelectionMoveMock).toHaveBeenCalledWith({
      aspectRatio: 2,
      dragStartPoint: { x: 100, y: 120 },
      event,
      getMaxSelectionHeight: expect.any(Function),
      getMaxSelectionWidth: expect.any(Function),
      maintainAspectRatio: true,
      minSelectionSize: 40,
      resizeDirection: 'se',
      selectionAtDragStart: { x: 30, y: 40, width: 160, height: 80 },
    });
    expect(result).toEqual({ x: 40, y: 50, width: 200, height: 120 });
  });
}

describe('selection-mode frame lifecycle', () => {
  registerResetTest();
  registerUiDelegationTest();
  registerResizeDelegationTest();
});
