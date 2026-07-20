import { beforeEach, describe, expect, it, vi } from 'vitest';

const graphMocks = vi.hoisted(() => ({
  createSelectionModeEventHandlersMock: vi.fn(),
  createSelectionModeEventsBridgeMock: vi.fn(),
  createSelectionModeRuntimeSetupMock: vi.fn(),
}));

vi.mock('../events/handlers', () => ({
  createSelectionModeEventHandlers: graphMocks.createSelectionModeEventHandlersMock,
}));

vi.mock('../events/bridge', () => ({
  createSelectionModeEventsBridge: graphMocks.createSelectionModeEventsBridgeMock,
}));

vi.mock('./setup', () => ({
  createSelectionModeRuntimeSetup: graphMocks.createSelectionModeRuntimeSetupMock,
}));

import { createSelectionModeRuntimeGraphBindings } from './graph-bindings';

beforeEach(() => {
  vi.clearAllMocks();
});

function expectRuntimeGraphSetup(args: {
  graph: ReturnType<typeof createSelectionModeRuntimeGraphBindings>;
  runtimeArgs: { state: { currentState: string } };
  values: {
    cleanup: ReturnType<typeof vi.fn>;
    currentSelection: ReturnType<typeof vi.fn>;
    disableCursor: ReturnType<typeof vi.fn>;
    getMaxSelectionHeight: ReturnType<typeof vi.fn>;
    getMaxSelectionWidth: ReturnType<typeof vi.fn>;
    getRejectCallback: ReturnType<typeof vi.fn>;
    getResolveCallback: ReturnType<typeof vi.fn>;
    minSelectionSize: number;
    mutableRefs: never;
    setCleanupEventListeners: ReturnType<typeof vi.fn>;
    setCleanupScrollListeners: ReturnType<typeof vi.fn>;
    updateFinalFrame: ReturnType<typeof vi.fn>;
    zIndexBase: number;
  };
}) {
  expect(graphMocks.createSelectionModeRuntimeSetupMock).toHaveBeenCalledWith(
    expect.objectContaining({
      createDragFrame: expect.any(Function),
      createFinalElements: expect.any(Function),
      getMaxSelectionHeight: args.values.getMaxSelectionHeight,
      getMaxSelectionWidth: args.values.getMaxSelectionWidth,
      minSelectionSize: args.values.minSelectionSize,
      mutableRefs: args.values.mutableRefs,
      setCleanupEventListeners: args.values.setCleanupEventListeners,
      setCleanupScrollListeners: args.values.setCleanupScrollListeners,
      updateFinalFrame: args.values.updateFinalFrame,
      zIndexBase: args.values.zIndexBase,
    })
  );
  expect(graphMocks.createSelectionModeEventsBridgeMock).toHaveBeenCalledWith(
    expect.objectContaining({
      cleanupEvent: args.values.cleanup,
      currentSelection: args.values.currentSelection,
      disableCursor: args.values.disableCursor,
      getRejectCallback: args.values.getRejectCallback,
      getResolveCallback: args.values.getResolveCallback,
      runtimeArgs: args.runtimeArgs,
    })
  );
}

function expectRuntimeGraphShape(args: {
  graph: ReturnType<typeof createSelectionModeRuntimeGraphBindings>;
  runtimeArgs: { state: { currentState: string } };
  selectionModeEvents: { updateFinalFrame: ReturnType<typeof vi.fn> };
}) {
  expect(graphMocks.createSelectionModeEventHandlersMock).toHaveBeenCalledWith({
    selectionModeEvents: args.selectionModeEvents,
    state: args.runtimeArgs.state,
  });
  expect(args.graph).toEqual({
    selectionModeEvents: args.selectionModeEvents,
    selectionModeRuntimeArgs: args.runtimeArgs,
  });
}

function createRuntimeGraphBindingsScenario() {
  const runtimeArgs = {
    state: { currentState: 'idle' },
    hideHoverFrame: vi.fn(),
  } as {
    state: { currentState: string };
    hideHoverFrame: ReturnType<typeof vi.fn>;
  };
  const selectionModeEvents = { updateFinalFrame: vi.fn() } as never;
  const args = {
    cleanup: vi.fn(),
    currentSelection: vi.fn(),
    disableCursor: vi.fn(),
    getMaxSelectionHeight: vi.fn(() => 600),
    getMaxSelectionWidth: vi.fn(() => 800),
    getRejectCallback: vi.fn(() => null),
    getResolveCallback: vi.fn(() => null),
    minSelectionSize: 32,
    mutableRefs: {} as never,
    selectionModeUiRuntime: { createDragFrame: vi.fn(), createFinalElements: vi.fn() },
    setCleanupEventListeners: vi.fn(),
    setCleanupScrollListeners: vi.fn(),
    state: { currentState: 'idle' } as never,
    updateFinalFrame: vi.fn(),
    zIndexBase: 500,
  };

  graphMocks.createSelectionModeRuntimeSetupMock.mockReturnValue(runtimeArgs);
  graphMocks.createSelectionModeEventsBridgeMock.mockReturnValue(selectionModeEvents);
  graphMocks.createSelectionModeEventHandlersMock.mockReturnValue({
    handleClick: vi.fn(),
    handleKeyDown: vi.fn(),
    handleMouseDown: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleMouseMove: vi.fn(),
    handleMouseUp: vi.fn(),
  });

  const graph = createSelectionModeRuntimeGraphBindings(args);

  return { args, graph, runtimeArgs, selectionModeEvents };
}

function expectGraphBindingHandlersReuseSameInstance(args: {
  graph: ReturnType<typeof createSelectionModeRuntimeGraphBindings>;
  runtimeArgs: { state: { currentState: string } };
  selectionModeEvents: { updateFinalFrame: ReturnType<typeof vi.fn> };
}) {
  const firstSetupCall = graphMocks.createSelectionModeRuntimeSetupMock.mock.calls[0];
  if (!firstSetupCall) {
    throw new Error('Expected selection-mode runtime setup');
  }
  const setupArgs = firstSetupCall[0];
  [
    () => setupArgs.handleClick({} as never, undefined),
    () => setupArgs.handleKeyDown({} as never),
    () => setupArgs.handleMouseDown({} as never, undefined),
    () => setupArgs.handleMouseLeave(),
    () => setupArgs.handleMouseMove({} as never, undefined),
    () => setupArgs.handleMouseUp({} as never, undefined),
  ].forEach((invoke) => invoke());

  const firstBridgeCall = graphMocks.createSelectionModeEventsBridgeMock.mock.calls[0];
  if (!firstBridgeCall) {
    throw new Error('Expected selection-mode events bridge');
  }
  const bridgeArgs = firstBridgeCall[0];
  bridgeArgs.handleKeyDown({} as never);

  expect(graphMocks.createSelectionModeEventHandlersMock).toHaveBeenCalledWith({
    selectionModeEvents: args.selectionModeEvents,
    state: args.runtimeArgs.state,
  });
  const firstEventHandlersResult = graphMocks.createSelectionModeEventHandlersMock.mock.results[0];
  if (!firstEventHandlersResult) {
    throw new Error('Expected selection-mode event handlers');
  }
  expect(firstEventHandlersResult.value.handleKeyDown).toHaveBeenCalledTimes(2);
  expect(args.graph).toEqual({
    selectionModeEvents: args.selectionModeEvents,
    selectionModeRuntimeArgs: args.runtimeArgs,
  });
}

describe('selection-mode runtime graph bindings', () => {
  it('connects runtime setup, event handlers, and events bridge through the same owner graph', () => {
    const { args, graph, runtimeArgs, selectionModeEvents } = createRuntimeGraphBindingsScenario();

    expectRuntimeGraphSetup({
      graph,
      runtimeArgs,
      values: args,
    });
    expectRuntimeGraphShape({
      graph,
      runtimeArgs,
      selectionModeEvents,
    });
  });

  it('forwards bridge keydown handling through the same handler instance', () => {
    const { graph, runtimeArgs, selectionModeEvents } = createRuntimeGraphBindingsScenario();

    expectGraphBindingHandlersReuseSameInstance({ graph, runtimeArgs, selectionModeEvents });
  });
});
