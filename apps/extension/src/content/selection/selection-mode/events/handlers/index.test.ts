// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getContentEventTargetElementMock,
  handleSelectionModeClickMock,
  handleSelectionModeKeyDownMock,
  handleSelectionModeMouseDownMock,
  handleSelectionModeMouseLeaveMock,
  handleSelectionModeMouseMoveMock,
  handleSelectionModeMouseUpMock,
  logSelectionModeRuntimeMock,
  resolveIframeEventTargetMock,
} = vi.hoisted(() => ({
  getContentEventTargetElementMock: vi.fn(),
  handleSelectionModeClickMock: vi.fn(),
  handleSelectionModeKeyDownMock: vi.fn(),
  handleSelectionModeMouseDownMock: vi.fn(),
  handleSelectionModeMouseLeaveMock: vi.fn(),
  handleSelectionModeMouseMoveMock: vi.fn(),
  handleSelectionModeMouseUpMock: vi.fn(),
  logSelectionModeRuntimeMock: vi.fn(),
  resolveIframeEventTargetMock: vi.fn(),
}));

vi.mock('../../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/dom-host')>()),
  getContentEventTargetElement: getContentEventTargetElementMock,
}));

vi.mock('../../../../platform/frame', () => ({
  resolveIframeEventTarget: resolveIframeEventTargetMock,
}));

vi.mock('../commands', () => ({
  handleSelectionModeClick: handleSelectionModeClickMock,
  handleSelectionModeKeyDown: handleSelectionModeKeyDownMock,
}));

vi.mock('../pointer-handlers', () => ({
  handleSelectionModeMouseDown: handleSelectionModeMouseDownMock,
  handleSelectionModeMouseLeave: handleSelectionModeMouseLeaveMock,
  handleSelectionModeMouseMove: handleSelectionModeMouseMoveMock,
  handleSelectionModeMouseUp: handleSelectionModeMouseUpMock,
}));

vi.mock('../../diag', () => ({
  logSelectionModeRuntime: logSelectionModeRuntimeMock,
}));

import { createSelectionModeEventHandlers } from '.';

function createHandlersFixture() {
  const selectionModeEvents = {
    cancelSelection: vi.fn(),
    closeCaptureActionMenu: vi.fn(() => false),
    confirmSelection: vi.fn(),
    constrainSelection: vi.fn(),
    finalizeDragSelection: vi.fn(),
    flushFinalFrameUpdate: vi.fn(),
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
    handlers: createSelectionModeEventHandlers({
      selectionModeEvents: selectionModeEvents as never,
      state: state as never,
    }),
    selectionModeEvents,
    state,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function expectActivationHandlerLifecycle() {
  const { handlers, selectionModeEvents, state } = createHandlersFixture();
  const clickTarget = document.createElement('button');
  getContentEventTargetElementMock.mockReturnValue(clickTarget);
  const clickEvent = new MouseEvent('click');
  const keyEvent = new KeyboardEvent('keydown', { key: 'Escape' });

  handlers.handleClick(clickEvent);
  handlers.handleKeyDown(keyEvent);

  expect(handleSelectionModeClickMock).toHaveBeenCalledWith(
    clickEvent,
    state,
    selectionModeEvents,
    undefined
  );
  expect(handleSelectionModeKeyDownMock).toHaveBeenCalledWith(keyEvent, state, selectionModeEvents);
  expect(logSelectionModeRuntimeMock).toHaveBeenCalledWith('Click received', {
    currentState: 'hover',
    tagName: 'BUTTON',
  });
  expect(logSelectionModeRuntimeMock).toHaveBeenCalledWith('KeyDown received', {
    currentState: 'hover',
    key: 'Escape',
  });
}

function expectPointerHandlerLifecycle() {
  const { handlers, selectionModeEvents, state } = createHandlersFixture();
  const nextTarget = document.createElement('section');
  getContentEventTargetElementMock.mockReturnValue(nextTarget);
  resolveIframeEventTargetMock.mockReturnValue(document.createElement('article'));
  const moveEvent = new MouseEvent('mousemove');
  const downEvent = new MouseEvent('mousedown');

  handlers.handleMouseMove(moveEvent);
  handlers.handleMouseDown(downEvent);
  handlers.handleMouseUp();
  handlers.handleMouseLeave();

  expect(logSelectionModeRuntimeMock).toHaveBeenCalledWith('MouseMove target changed', {
    currentState: 'hover',
    tagName: 'SECTION',
  });
  expect(logSelectionModeRuntimeMock).toHaveBeenCalledWith('MouseDown received', {
    currentState: 'hover',
    tagName: 'ARTICLE',
  });
  expect(logSelectionModeRuntimeMock).toHaveBeenCalledWith('MouseUp received', {
    currentState: 'hover',
  });
  expect(handleSelectionModeMouseMoveMock).toHaveBeenCalledWith(
    moveEvent,
    state,
    selectionModeEvents,
    undefined
  );
  expect(handleSelectionModeMouseDownMock).toHaveBeenCalledWith(
    downEvent,
    state,
    selectionModeEvents,
    undefined
  );
  expect(handleSelectionModeMouseUpMock).toHaveBeenCalledWith(state, selectionModeEvents);
  expect(handleSelectionModeMouseLeaveMock).toHaveBeenCalledWith(state, selectionModeEvents);
}

function expectIframeTargetShortCircuit() {
  const { handlers } = createHandlersFixture();
  const iframeTarget = document.createElement('article');
  const fallbackTarget = document.createElement('section');
  resolveIframeEventTargetMock.mockReturnValue(iframeTarget);
  getContentEventTargetElementMock.mockReturnValue(fallbackTarget);

  handlers.handleMouseDown(new MouseEvent('mousedown'));

  expect(resolveIframeEventTargetMock).toHaveBeenCalledTimes(1);
  expect(getContentEventTargetElementMock).not.toHaveBeenCalled();
  expect(logSelectionModeRuntimeMock).toHaveBeenCalledWith('MouseDown received', {
    currentState: 'hover',
    tagName: 'ARTICLE',
  });
}

function expectContentTargetFallback() {
  const { handlers } = createHandlersFixture();
  const fallbackTarget = document.createElement('section');
  resolveIframeEventTargetMock.mockReturnValue(null);
  getContentEventTargetElementMock.mockReturnValue(fallbackTarget);

  handlers.handleMouseDown(new MouseEvent('mousedown'));

  expect(resolveIframeEventTargetMock).toHaveBeenCalledTimes(1);
  expect(getContentEventTargetElementMock).toHaveBeenCalledTimes(1);
  expect(logSelectionModeRuntimeMock).toHaveBeenCalledWith('MouseDown received', {
    currentState: 'hover',
    tagName: 'SECTION',
  });
}

function expectDirectManipulationSkipsPointerDiagnostics() {
  const { handlers, state } = createHandlersFixture();
  state.currentState = 'drag';

  handlers.handleMouseMove(new MouseEvent('mousemove'));

  expect(getContentEventTargetElementMock).not.toHaveBeenCalled();
  expect(logSelectionModeRuntimeMock).not.toHaveBeenCalledWith(
    'MouseMove target changed',
    expect.anything()
  );
}

describe('selection-mode activation handlers', () => {
  it(
    'logs and delegates click and keyboard activation through the event seam',
    expectActivationHandlerLifecycle
  );
});

describe('selection-mode pointer handlers', () => {
  it(
    'logs pointer target changes and delegates pointer lifecycle handlers',
    expectPointerHandlerLifecycle
  );
  it('short-circuits content target lookup when iframe resolution succeeds', () => {
    expectIframeTargetShortCircuit();
  });
  it('uses the content target exactly once when iframe resolution misses', () => {
    expectContentTargetFallback();
  });
  it('skips pointer target diagnostics during direct manipulation', () => {
    expectDirectManipulationSkipsPointerDiagnostics();
  });
});
