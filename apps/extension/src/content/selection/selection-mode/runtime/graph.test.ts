import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSelectionModeEventHandlers = vi.fn(() => ({
  handleClick: vi.fn(),
  handleKeyDown: vi.fn(),
  handleMouseDown: vi.fn(),
  handleMouseLeave: vi.fn(),
  handleMouseMove: vi.fn(),
  handleMouseUp: vi.fn(),
}));

const createSelectionModeEventsBridge = vi.fn(() => ({
  cancelSelection: vi.fn(),
  cleanup: vi.fn(),
  confirmSelection: vi.fn(),
}));

const liveRuntimeState = { currentState: 'idle' };
const createSelectionModeRuntimeSetup = vi.fn(() => ({
  state: liveRuntimeState,
}));

type RuntimeSetupBinding = {
  createDragFrame: () => void;
  createFinalElements: () => void;
  getMaxSelectionHeight: () => number;
  getMaxSelectionWidth: () => number;
  handleClick: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  handleMouseDown: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  handleMouseLeave: () => void;
  handleMouseMove: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  handleMouseUp: () => void;
  minSelectionSize: number;
  mutableRefs: unknown;
  setCleanupEventListeners: ReturnType<typeof vi.fn>;
  setCleanupScrollListeners: ReturnType<typeof vi.fn>;
  updateFinalFrame: ReturnType<typeof vi.fn>;
  zIndexBase: number;
};

type BridgeBinding = {
  cleanupEvent: ReturnType<typeof vi.fn>;
  currentSelection: ReturnType<typeof vi.fn>;
  disableCursor: ReturnType<typeof vi.fn>;
  getRejectCallback: ReturnType<typeof vi.fn>;
  getResolveCallback: ReturnType<typeof vi.fn>;
  handleKeyDown: (event: KeyboardEvent) => void;
  runtimeArgs: { state: typeof liveRuntimeState };
};

type EventHandlerBinding = {
  selectionModeEvents: unknown;
  state: unknown;
};

vi.mock('../events/handlers', () => ({
  createSelectionModeEventHandlers,
}));

vi.mock('../events/bridge', () => ({
  createSelectionModeEventsBridge,
}));

vi.mock('./setup', () => ({
  createSelectionModeRuntimeSetup,
}));

function createRuntimeGraphArgs(
  overrides: Partial<Parameters<typeof import('./graph').createSelectionModeRuntimeGraph>[0]> = {}
) {
  return {
    cleanup: vi.fn(),
    currentSelection: vi.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
    disableCursor: vi.fn(),
    getMaxSelectionHeight: () => 100,
    getMaxSelectionWidth: () => 100,
    getRejectCallback: vi.fn(() => null),
    getResolveCallback: vi.fn(() => null),
    minSelectionSize: 10,
    mutableRefs: {} as never,
    selectionModeUiRuntime: {
      createDragFrame: vi.fn(),
      createFinalElements: vi.fn(),
    },
    setCleanupEventListeners: vi.fn(),
    setCleanupScrollListeners: vi.fn(),
    state: { currentState: 'stale-idle' } as never,
    updateFinalFrame: vi.fn(),
    zIndexBase: 100,
    ...overrides,
  };
}

function registerLiveRuntimeStateTest() {
  it('wires event handlers to the live runtime state from setup', async () => {
    const { createSelectionModeRuntimeGraph } = await import('./graph');
    const baseState = { currentState: 'stale-idle' };

    createSelectionModeRuntimeGraph(createRuntimeGraphArgs({ state: baseState as never }));

    const eventHandlerCalls = createSelectionModeEventHandlers.mock.calls as unknown as Array<
      [{ state: unknown }]
    >;

    expect(createSelectionModeEventHandlers).toHaveBeenCalledTimes(1);
    expect(eventHandlerCalls[0]?.[0]).toMatchObject({
      state: liveRuntimeState,
    });
    expect(eventHandlerCalls[0]?.[0]?.state).not.toBe(baseState);
  });
}

function expectRuntimeSetupBinding(
  runtimeSetupArgs: RuntimeSetupBinding,
  selectionModeUiRuntime: {
    createDragFrame: ReturnType<typeof vi.fn>;
    createFinalElements: ReturnType<typeof vi.fn>;
  },
  setCleanupEventListeners: ReturnType<typeof vi.fn>,
  setCleanupScrollListeners: ReturnType<typeof vi.fn>,
  updateFinalFrame: ReturnType<typeof vi.fn>
) {
  expect(runtimeSetupArgs).toMatchObject({
    minSelectionSize: 100,
    setCleanupEventListeners,
    setCleanupScrollListeners,
    updateFinalFrame,
    zIndexBase: 800,
  });
  expect(runtimeSetupArgs.getMaxSelectionHeight()).toBe(900);
  expect(runtimeSetupArgs.getMaxSelectionWidth()).toBe(1400);
  expect(runtimeSetupArgs.createDragFrame).toBeTypeOf('function');
  expect(runtimeSetupArgs.createFinalElements).toBeTypeOf('function');
  runtimeSetupArgs.createDragFrame();
  runtimeSetupArgs.createFinalElements();
  expect(selectionModeUiRuntime.createDragFrame).toHaveBeenCalledTimes(1);
  expect(selectionModeUiRuntime.createFinalElements).toHaveBeenCalledTimes(1);
}

function expectBridgeBinding(
  bridgeArgs: BridgeBinding,
  cleanup: ReturnType<typeof vi.fn>,
  currentSelection: ReturnType<typeof vi.fn>,
  disableCursor: ReturnType<typeof vi.fn>,
  getRejectCallback: ReturnType<typeof vi.fn>,
  getResolveCallback: ReturnType<typeof vi.fn>
) {
  expect(bridgeArgs).toMatchObject({
    cleanupEvent: cleanup,
    currentSelection,
    disableCursor,
    getRejectCallback,
    getResolveCallback,
    runtimeArgs: { state: liveRuntimeState },
  });
}

function createRuntimeBindingScenario() {
  return {
    selectionModeUiRuntime: {
      createDragFrame: vi.fn(),
      createFinalElements: vi.fn(),
    },
    cleanup: vi.fn(),
    disableCursor: vi.fn(),
    getResolveCallback: vi.fn(() => null),
    getRejectCallback: vi.fn(() => null),
    currentSelection: vi.fn(() => ({ x: 1, y: 2, width: 3, height: 4 })),
    setCleanupEventListeners: vi.fn(),
    setCleanupScrollListeners: vi.fn(),
    updateFinalFrame: vi.fn(),
  };
}

function expectKeyDownBinding(bridgeArgs: BridgeBinding) {
  expect(bridgeArgs.handleKeyDown).toBeTypeOf('function');
  bridgeArgs.handleKeyDown({ key: 'Escape' } as KeyboardEvent);
  expect(
    createSelectionModeEventHandlers.mock.results[0]?.value.handleKeyDown
  ).toHaveBeenCalledTimes(1);
}

function createRuntimeBindingResult(
  createSelectionModeRuntimeGraph: typeof import('./graph').createSelectionModeRuntimeGraph,
  scenario: ReturnType<typeof createRuntimeBindingScenario>
) {
  return createSelectionModeRuntimeGraph(
    createRuntimeGraphArgs({
      cleanup: scenario.cleanup,
      currentSelection: scenario.currentSelection,
      disableCursor: scenario.disableCursor,
      getMaxSelectionHeight: () => 900,
      getMaxSelectionWidth: () => 1400,
      getRejectCallback: scenario.getRejectCallback,
      getResolveCallback: scenario.getResolveCallback,
      minSelectionSize: 100,
      mutableRefs: { currentState: 'idle' } as never,
      selectionModeUiRuntime: scenario.selectionModeUiRuntime,
      setCleanupEventListeners: scenario.setCleanupEventListeners,
      setCleanupScrollListeners: scenario.setCleanupScrollListeners,
      state: { currentState: 'stale' } as never,
      updateFinalFrame: scenario.updateFinalFrame,
      zIndexBase: 800,
    })
  );
}

function captureRuntimeBindings() {
  const runtimeSetupCalls = createSelectionModeRuntimeSetup.mock.calls as unknown as Array<
    [RuntimeSetupBinding]
  >;
  const bridgeCalls = createSelectionModeEventsBridge.mock.calls as unknown as Array<
    [BridgeBinding]
  >;
  const eventHandlerCalls = createSelectionModeEventHandlers.mock.calls as unknown as Array<
    [EventHandlerBinding]
  >;
  const runtimeSetupArgs = runtimeSetupCalls[0]?.[0] as RuntimeSetupBinding | undefined;
  const bridgeArgs = bridgeCalls[0]?.[0] as BridgeBinding | undefined;
  const eventHandlerArgs = eventHandlerCalls[0]?.[0] as EventHandlerBinding | undefined;

  if (!runtimeSetupArgs || !bridgeArgs || !eventHandlerArgs) {
    throw new Error('Expected runtime graph bindings to be created');
  }

  return { runtimeSetupArgs, bridgeArgs, eventHandlerArgs };
}

function registerRuntimeBindingTest() {
  it('binds runtime setup and events bridge through the live event-handler closures', async () => {
    const { createSelectionModeRuntimeGraph } = await import('./graph');
    const scenario = createRuntimeBindingScenario();
    const result = createRuntimeBindingResult(createSelectionModeRuntimeGraph, scenario);
    const { runtimeSetupArgs, bridgeArgs, eventHandlerArgs } = captureRuntimeBindings();

    expectRuntimeSetupBinding(
      runtimeSetupArgs,
      scenario.selectionModeUiRuntime,
      scenario.setCleanupEventListeners,
      scenario.setCleanupScrollListeners,
      scenario.updateFinalFrame
    );
    expectBridgeBinding(
      bridgeArgs,
      scenario.cleanup,
      scenario.currentSelection,
      scenario.disableCursor,
      scenario.getRejectCallback,
      scenario.getResolveCallback
    );
    expectKeyDownBinding(bridgeArgs);
    expect(eventHandlerArgs.selectionModeEvents).toBe(result.selectionModeEvents);
    expect(result.selectionModeRuntimeArgs).toEqual({ state: liveRuntimeState });
  });
}

describe('selection-mode runtime graph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerLiveRuntimeStateTest();
  registerRuntimeBindingTest();
});
