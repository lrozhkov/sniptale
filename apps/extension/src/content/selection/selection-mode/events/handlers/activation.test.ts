// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const activationMocks = vi.hoisted(() => ({
  handleSelectionModeClickMock: vi.fn(),
  handleSelectionModeKeyDownMock: vi.fn(),
  getSelectionModeResolvedTagNameMock: vi.fn(),
  logSelectionModeEventMock: vi.fn(),
}));

vi.mock('..', () => ({
  handleSelectionModeClick: activationMocks.handleSelectionModeClickMock,
  handleSelectionModeKeyDown: activationMocks.handleSelectionModeKeyDownMock,
}));

vi.mock('./helpers', () => ({
  getSelectionModeResolvedTagName: activationMocks.getSelectionModeResolvedTagNameMock,
  logSelectionModeEvent: activationMocks.logSelectionModeEventMock,
}));

import { createSelectionModeActivationHandlers } from './activation';

beforeEach(() => {
  vi.clearAllMocks();
});

function createActivationFixture() {
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
  };
  const withStateSync = vi.fn((callback: () => void) => callback());

  return {
    handlers: createSelectionModeActivationHandlers({
      selectionModeEvents: selectionModeEvents as never,
      state: state as never,
      withStateSync,
    }),
    selectionModeEvents,
    state,
    withStateSync,
  };
}

describe('selection-mode activation handlers', () => {
  it('logs click and keydown activation before delegating through state sync', () => {
    const { handlers, selectionModeEvents, state, withStateSync } = createActivationFixture();
    const clickEvent = new MouseEvent('click');
    const keyEvent = new KeyboardEvent('keydown', { key: 'Escape' });

    activationMocks.getSelectionModeResolvedTagNameMock.mockReturnValue('BUTTON');

    handlers.handleClick(clickEvent);
    handlers.handleKeyDown(keyEvent);

    expect(activationMocks.logSelectionModeEventMock).toHaveBeenCalledWith('Click received', {
      currentState: 'hover',
      tagName: 'BUTTON',
    });
    expect(activationMocks.logSelectionModeEventMock).toHaveBeenCalledWith('KeyDown received', {
      currentState: 'hover',
      key: 'Escape',
    });
    expect(activationMocks.handleSelectionModeClickMock).toHaveBeenCalledWith(
      clickEvent,
      state,
      selectionModeEvents,
      undefined
    );
    expect(activationMocks.handleSelectionModeKeyDownMock).toHaveBeenCalledWith(
      keyEvent,
      state,
      selectionModeEvents
    );
    expect(withStateSync).toHaveBeenCalledTimes(2);
  });
});
