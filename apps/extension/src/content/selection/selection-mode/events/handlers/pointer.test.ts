// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const pointerMocks = vi.hoisted(() => ({
  getContentEventTargetElementMock: vi.fn(),
  getSelectionModeResolvedTagNameMock: vi.fn(),
  handleSelectionModeMouseDownMock: vi.fn(),
  handleSelectionModeMouseLeaveMock: vi.fn(),
  handleSelectionModeMouseMoveMock: vi.fn(),
  handleSelectionModeMouseUpMock: vi.fn(),
  logSelectionModeEventMock: vi.fn(),
}));

vi.mock('../../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/dom-host')>()),
  getContentEventTargetElement: pointerMocks.getContentEventTargetElementMock,
}));

vi.mock('..', () => ({
  handleSelectionModeMouseDown: pointerMocks.handleSelectionModeMouseDownMock,
  handleSelectionModeMouseLeave: pointerMocks.handleSelectionModeMouseLeaveMock,
  handleSelectionModeMouseMove: pointerMocks.handleSelectionModeMouseMoveMock,
  handleSelectionModeMouseUp: pointerMocks.handleSelectionModeMouseUpMock,
}));

vi.mock('./helpers', () => ({
  getSelectionModeResolvedTagName: pointerMocks.getSelectionModeResolvedTagNameMock,
  logSelectionModeEvent: pointerMocks.logSelectionModeEventMock,
}));

import {
  createSelectionModePointerHandlers,
  createSelectionModePointerLogger,
  createSelectionModePointerMoveHandler,
} from './pointer';

beforeEach(() => {
  vi.clearAllMocks();
});

function createPointerFixture() {
  const selectionModeEvents = {
    cancelSelection: vi.fn(),
    confirmSelection: vi.fn(),
    constrainSelection: vi.fn(),
    finalizeDragSelection: vi.fn(),
    handleDragMove: vi.fn(),
    handleResizeMove: vi.fn(),
    hideHoverFrame: vi.fn(),
    isExtensionUIElement: vi.fn(),
    resetToIdleState: vi.fn(),
    selectElement: vi.fn(),
    showHoverFrame: vi.fn(),
    startDragSelection: vi.fn(),
    updateDragSelection: vi.fn(),
    updateFinalFrame: vi.fn(),
  };
  const state = {
    currentState: 'hover',
    hoveredElement: document.createElement('div'),
  };

  return {
    handlers: createSelectionModePointerHandlers({
      selectionModeEvents: selectionModeEvents as never,
      state: state as never,
    }),
    selectionModeEvents,
    state,
  };
}

describe('selection-mode pointer logger', () => {
  it('logs pointer target changes only when the hovered element changes', () => {
    const target = document.createElement('section');
    pointerMocks.getContentEventTargetElementMock.mockReturnValue(target);

    createSelectionModePointerLogger(
      { currentState: 'hover' } as never,
      document.createElement('article'),
      new MouseEvent('mousemove')
    );

    expect(pointerMocks.logSelectionModeEventMock).toHaveBeenCalledWith(
      'MouseMove target changed',
      {
        currentState: 'hover',
        tagName: 'SECTION',
      }
    );
  });
});

describe('selection-mode pointer lifecycle handlers', () => {
  it('delegates pointer move and down handlers directly', () => {
    const { handlers, selectionModeEvents, state } = createPointerFixture();
    const moveEvent = new MouseEvent('mousemove');
    const downEvent = new MouseEvent('mousedown');

    const target = document.createElement('section');
    pointerMocks.getContentEventTargetElementMock.mockReturnValue(target);
    pointerMocks.getSelectionModeResolvedTagNameMock.mockReturnValue('ARTICLE');

    handlers.handleMouseMove(moveEvent);
    handlers.handleMouseDown(downEvent);

    expect(pointerMocks.handleSelectionModeMouseMoveMock).toHaveBeenCalledWith(
      moveEvent,
      state,
      selectionModeEvents,
      undefined
    );
    expect(pointerMocks.handleSelectionModeMouseDownMock).toHaveBeenCalledWith(
      downEvent,
      state,
      selectionModeEvents,
      undefined
    );
  });

  it('delegates pointer up and leave handlers directly', () => {
    const { handlers, selectionModeEvents, state } = createPointerFixture();

    handlers.handleMouseUp();
    handlers.handleMouseLeave();

    expect(pointerMocks.handleSelectionModeMouseUpMock).toHaveBeenCalledWith(
      state,
      selectionModeEvents
    );
    expect(pointerMocks.handleSelectionModeMouseLeaveMock).toHaveBeenCalledWith(
      state,
      selectionModeEvents
    );
  });
});

describe('selection-mode pointer move handler', () => {
  it('creates a pointer move handler that logs before delegating', () => {
    const { selectionModeEvents, state } = createPointerFixture();
    const handleMouseMove = createSelectionModePointerMoveHandler({
      selectionModeEvents: selectionModeEvents as never,
      state: state as never,
    });
    const target = document.createElement('section');
    pointerMocks.getContentEventTargetElementMock.mockReturnValue(target);
    const moveEvent = new MouseEvent('mousemove');

    handleMouseMove(moveEvent);

    expect(pointerMocks.logSelectionModeEventMock).toHaveBeenCalledWith(
      'MouseMove target changed',
      {
        currentState: 'hover',
        tagName: 'SECTION',
      }
    );
    expect(pointerMocks.handleSelectionModeMouseMoveMock).toHaveBeenCalledWith(
      moveEvent,
      state,
      selectionModeEvents,
      undefined
    );
  });
});
