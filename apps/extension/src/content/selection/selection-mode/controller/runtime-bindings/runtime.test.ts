import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({
  createSelectionModeRuntimeGraphBindingsMock: vi.fn(),
  createSelectionModeSessionLocalSettersMock: vi.fn(),
}));

vi.mock('../../runtime/graph-bindings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/graph-bindings')>()),
  createSelectionModeRuntimeGraphBindings: runtimeMocks.createSelectionModeRuntimeGraphBindingsMock,
}));

vi.mock('../../session/locals/setters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session/locals/setters')>()),
  createSelectionModeSessionLocalSetters: runtimeMocks.createSelectionModeSessionLocalSettersMock,
}));

import { createSelectionModeRuntimeBindings } from './runtime';
import type { SelectionModeRuntimeFacade } from '../../runtime/facade/types';

beforeEach(() => {
  vi.clearAllMocks();
});

function createRuntimeScenario() {
  const session = {
    rejectCallback: vi.fn(),
    resolveCallback: vi.fn(),
    currentSelection: { height: 12, width: 10, x: 1, y: 2 },
  };
  const sessionSetters = {
    setCleanupEventListeners: vi.fn(),
    setCleanupScrollListeners: vi.fn(),
  };
  const runtimeFacade = {
    disableCursor: vi.fn(),
    uiRuntime: {
      createDragFrame: vi.fn(),
      createFinalElements: vi.fn(),
      createHoverElements: vi.fn(),
      createOverlayContainer: vi.fn(),
      prepare: vi.fn(),
    },
  } as Pick<SelectionModeRuntimeFacade, 'disableCursor' | 'uiRuntime'>;
  const runtimeGraph = { graph: true } as never;

  runtimeMocks.createSelectionModeSessionLocalSettersMock.mockReturnValue(sessionSetters);
  runtimeMocks.createSelectionModeRuntimeGraphBindingsMock.mockReturnValue(runtimeGraph);

  const result = createSelectionModeRuntimeBindings({
    cleanup: vi.fn(),
    mutableRefs: {} as never,
    runtimeFacade: runtimeFacade as SelectionModeRuntimeFacade,
    session: session as never,
    state: { state: true } as never,
    updateFinalFrame: vi.fn(),
  });

  return { result, runtimeFacade, runtimeGraph, session, sessionSetters };
}

describe('selection-mode controller bindings runtime', () => {
  it('assembles runtime graph bindings from the runtime facade and session locals', () => {
    const scenario = createRuntimeScenario();

    expect(runtimeMocks.createSelectionModeSessionLocalSettersMock).toHaveBeenCalledWith(
      scenario.session
    );
    expect(runtimeMocks.createSelectionModeRuntimeGraphBindingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cleanup: expect.any(Function),
        currentSelection: expect.any(Function),
        disableCursor: expect.any(Function),
        getMaxSelectionHeight: expect.any(Function),
        getMaxSelectionWidth: expect.any(Function),
        getRejectCallback: expect.any(Function),
        getResolveCallback: expect.any(Function),
        minSelectionSize: expect.any(Number),
        mutableRefs: {},
        selectionModeUiRuntime: scenario.runtimeFacade.uiRuntime,
        setCleanupEventListeners: scenario.sessionSetters.setCleanupEventListeners,
        setCleanupScrollListeners: scenario.sessionSetters.setCleanupScrollListeners,
        state: { state: true },
        updateFinalFrame: expect.any(Function),
        zIndexBase: expect.any(Number),
      })
    );
    expect(scenario.result).toBe(scenario.runtimeGraph);
  });
});
