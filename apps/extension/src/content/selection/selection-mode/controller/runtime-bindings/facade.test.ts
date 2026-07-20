import { beforeEach, describe, expect, it, vi } from 'vitest';

const facadeMocks = vi.hoisted(() => ({
  createSelectionModeRuntimeFacadeMock: vi.fn(),
  createSelectionModeSessionLocalSettersMock: vi.fn(),
  setupSelectionModeRuntimeListenersMock: vi.fn(),
}));

vi.mock('../../runtime/facade', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/facade')>()),
  createSelectionModeRuntimeFacade: facadeMocks.createSelectionModeRuntimeFacadeMock,
}));

vi.mock('../../session/locals/setters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session/locals/setters')>()),
  createSelectionModeSessionLocalSetters: facadeMocks.createSelectionModeSessionLocalSettersMock,
}));

vi.mock('../../interaction/actions/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../interaction/actions/runtime')>()),
  setupSelectionModeRuntimeListeners: facadeMocks.setupSelectionModeRuntimeListenersMock,
}));

import { createSelectionModeFacadeBindings } from './facade';

beforeEach(() => {
  vi.clearAllMocks();
});

function createFacadeFixtures() {
  const session = {
    aspectRatio: 1.5,
    currentSelection: { height: 12, width: 10, x: 1, y: 2 },
    dom: { hoverFrame: null, hoverSizeLabel: null },
    isActive: true,
    maintainAspectRatio: false,
    rejectCallback: vi.fn(),
    resolveCallback: vi.fn(),
  };
  const sessionSetters = {
    setAspectRatio: vi.fn(),
    setCurrentSelection: vi.fn(),
    setCurrentState: vi.fn(),
    setIsActive: vi.fn(),
    setMaintainAspectRatio: vi.fn(),
    setRejectCallback: vi.fn(),
    setResolveCallback: vi.fn(),
  };
  const runtimeEvents = {
    cancelSelection: vi.fn(),
    confirmSelection: vi.fn(),
    constrainSelection: vi.fn(),
    resetToIdleState: vi.fn(),
    updateFinalFrame: vi.fn(),
  };

  return { runtimeEvents, session, sessionSetters };
}

function createFacadeScenario() {
  const { runtimeEvents, session, sessionSetters } = createFacadeFixtures();
  const runtimeArgs = { state: { currentState: 'idle' } };
  const cleanup = vi.fn();

  facadeMocks.createSelectionModeSessionLocalSettersMock.mockReturnValue(sessionSetters);
  facadeMocks.createSelectionModeRuntimeFacadeMock.mockImplementation(() => ({
    facade: true,
  }));

  const result = createSelectionModeFacadeBindings({
    cleanup,
    getRuntimeArgs: () => runtimeArgs as never,
    getRuntimeEvents: () => runtimeEvents as never,
    session: session as never,
    state: { state: true } as never,
  });

  return {
    cleanup,
    result,
    runtimeArgs,
    runtimeEvents,
    session,
    sessionSetters,
  };
}

function expectFacadeScenario(args: ReturnType<typeof createFacadeScenario>) {
  expect(facadeMocks.createSelectionModeSessionLocalSettersMock).toHaveBeenCalledWith(args.session);
  expect(facadeMocks.createSelectionModeRuntimeFacadeMock).toHaveBeenCalledWith(
    expect.objectContaining({
      cleanup: args.cleanup,
      cancelSelection: expect.any(Function),
      confirmSelection: expect.any(Function),
      constrainSelection: expect.any(Function),
      getDom: expect.any(Function),
      getAspectRatio: expect.any(Function),
      getCurrentSelection: expect.any(Function),
      getIsActive: expect.any(Function),
      getMaintainAspectRatio: expect.any(Function),
      getMaxSelectionHeight: expect.any(Function),
      getMaxSelectionWidth: expect.any(Function),
      getRejectCallback: expect.any(Function),
      resetToIdleState: expect.any(Function),
      setAspectRatio: args.sessionSetters.setAspectRatio,
      setCurrentSelection: args.sessionSetters.setCurrentSelection,
      setCurrentState: args.sessionSetters.setCurrentState,
      setIsActive: args.sessionSetters.setIsActive,
      setMaintainAspectRatio: args.sessionSetters.setMaintainAspectRatio,
      setRejectCallback: args.sessionSetters.setRejectCallback,
      setResolveCallback: args.sessionSetters.setResolveCallback,
      setupRuntimeListeners: expect.any(Function),
      state: { state: true },
      updateFinalFrame: expect.any(Function),
    })
  );
  const runtimeFacadeArgs = facadeMocks.createSelectionModeRuntimeFacadeMock.mock.calls[0]?.[0];

  expect(runtimeFacadeArgs?.getAspectRatio()).toBe(args.session.aspectRatio);
  expect(runtimeFacadeArgs?.getCurrentSelection()).toBe(args.session.currentSelection);
  expect(runtimeFacadeArgs?.getDom()).toBe(args.session.dom);
  expect(runtimeFacadeArgs?.getIsActive()).toBe(args.session.isActive);
  expect(runtimeFacadeArgs?.getMaintainAspectRatio()).toBe(args.session.maintainAspectRatio);
  expect(runtimeFacadeArgs?.getRejectCallback()).toBe(args.session.rejectCallback);
  expect(facadeMocks.setupSelectionModeRuntimeListenersMock).toHaveBeenCalledWith(args.runtimeArgs);
}

describe('selection-mode controller bindings facade', () => {
  it('wires the runtime facade with session locals and runtime event closures', () => {
    const scenario = createFacadeScenario();
    const runtimeFacadeArgs = facadeMocks.createSelectionModeRuntimeFacadeMock.mock.calls[0]?.[0];

    runtimeFacadeArgs?.cancelSelection();
    runtimeFacadeArgs?.confirmSelection();
    runtimeFacadeArgs?.constrainSelection();
    runtimeFacadeArgs?.resetToIdleState();
    runtimeFacadeArgs?.updateFinalFrame();
    runtimeFacadeArgs?.setupRuntimeListeners();

    expectFacadeScenario(scenario);
    expect(scenario.runtimeEvents.cancelSelection).toHaveBeenCalledTimes(1);
    expect(scenario.runtimeEvents.confirmSelection).toHaveBeenCalledTimes(1);
    expect(scenario.runtimeEvents.constrainSelection).toHaveBeenCalledTimes(1);
    expect(scenario.runtimeEvents.resetToIdleState).toHaveBeenCalledTimes(1);
    expect(scenario.runtimeEvents.updateFinalFrame).toHaveBeenCalledTimes(1);
    expect(scenario.result).toEqual(expect.objectContaining({ facade: true }));
  });

  it('keeps the runtime facade dom getter aligned with the latest session dom', () => {
    const scenario = createFacadeScenario();
    const nextDom = { hoverFrame: null, hoverSizeLabel: null };
    const runtimeFacadeArgs = facadeMocks.createSelectionModeRuntimeFacadeMock.mock.calls[0]?.[0];

    scenario.session.dom = nextDom;

    expect(runtimeFacadeArgs?.getDom()).toBe(nextDom);
  });
});
