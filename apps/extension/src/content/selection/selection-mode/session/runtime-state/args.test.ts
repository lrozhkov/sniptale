import { beforeEach, describe, expect, it, vi } from 'vitest';

const argsMocks = vi.hoisted(() => ({
  getAbsolutePositionMock: vi.fn(),
  createSelectionModeHoverFrameHandlersMock: vi.fn(),
  createSelectionModeRuntimeStateMock: vi.fn(),
  createSelectionModeSetupListenerHandlersMock: vi.fn(),
}));

vi.mock('../../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal()),
  getAbsolutePosition: argsMocks.getAbsolutePositionMock,
}));

vi.mock('./hover-frame', () => ({
  createSelectionModeHoverFrameHandlers: argsMocks.createSelectionModeHoverFrameHandlersMock,
}));

vi.mock('./helpers', () => ({
  createSelectionModeRuntimeState: argsMocks.createSelectionModeRuntimeStateMock,
}));

vi.mock('./listeners', () => ({
  createSelectionModeSetupListenerHandlers: argsMocks.createSelectionModeSetupListenerHandlersMock,
}));

import { createSelectionModeRuntimeArgs } from './args';
import { createMutableRefs } from './test-support';

beforeEach(() => {
  vi.clearAllMocks();
});

function createRuntimeArgsFixture() {
  const refs = createMutableRefs();
  return {
    args: {
      createDragFrame: vi.fn(),
      getMaxSelectionHeight: vi.fn(() => 900),
      getMaxSelectionWidth: vi.fn(() => 1400),
      handleClick: vi.fn(),
      handleKeyDown: vi.fn(),
      handleMouseDown: vi.fn(),
      handleMouseLeave: vi.fn(),
      handleMouseMove: vi.fn(),
      handleMouseUp: vi.fn(),
      minSelectionSize: 100,
      refs,
      setCleanupEventListeners: vi.fn(),
      setCleanupScrollListeners: vi.fn(),
      showFinalFrame: vi.fn(),
      updateFinalFrame: vi.fn(),
      zIndexBase: 800,
    },
    hoverHandlers: { hideHoverFrame: vi.fn(), showHoverFrameDom: vi.fn() },
    listenerHandlers: { handleClick: vi.fn() },
    refs,
    runtimeState: { state: true } as never,
  };
}

function expectRuntimeArgsComposition(fixture: ReturnType<typeof createRuntimeArgsFixture>): void {
  const { args, hoverHandlers, listenerHandlers, refs, runtimeState } = fixture;
  const runtimeArgs = createSelectionModeRuntimeArgs(args);

  expect(argsMocks.createSelectionModeHoverFrameHandlersMock).toHaveBeenCalledWith(refs);
  expect(argsMocks.createSelectionModeSetupListenerHandlersMock).toHaveBeenCalledWith(args);
  expect(argsMocks.createSelectionModeRuntimeStateMock).toHaveBeenCalledWith(refs);
  expect(runtimeArgs).toMatchObject({
    ...hoverHandlers,
    createDragFrame: args.createDragFrame,
    getAbsolutePosition: argsMocks.getAbsolutePositionMock,
    getMaxSelectionHeight: args.getMaxSelectionHeight,
    getMaxSelectionWidth: args.getMaxSelectionWidth,
    minSelectionSize: args.minSelectionSize,
    setCleanupEventListeners: args.setCleanupEventListeners,
    setCleanupScrollListeners: args.setCleanupScrollListeners,
    setupListenerHandlers: listenerHandlers,
    showFinalFrame: args.showFinalFrame,
    state: runtimeState,
    updateFinalFrame: args.updateFinalFrame,
    zIndexBase: args.zIndexBase,
  });
}

describe('selection-mode runtime-state args assembly', () => {
  it('composes runtime args from hover, listener, and state seams', () => {
    const fixture = createRuntimeArgsFixture();
    const { hoverHandlers, listenerHandlers, runtimeState } = fixture;
    argsMocks.createSelectionModeHoverFrameHandlersMock.mockReturnValue(hoverHandlers);
    argsMocks.createSelectionModeSetupListenerHandlersMock.mockReturnValue(listenerHandlers);
    argsMocks.createSelectionModeRuntimeStateMock.mockReturnValue(runtimeState);

    expectRuntimeArgsComposition(fixture);
  });
});
