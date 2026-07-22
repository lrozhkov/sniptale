import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSelectionModeSession } from '../../session';

const facadeMocks = vi.hoisted(() => ({
  createSelectionModeRuntimeFacade: vi.fn(),
  setupSelectionModeRuntimeListeners: vi.fn(),
}));

vi.mock('../../runtime/facade', () => ({
  createSelectionModeRuntimeFacade: facadeMocks.createSelectionModeRuntimeFacade,
}));

vi.mock('../../interaction/actions/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../interaction/actions/runtime')>()),
  setupSelectionModeRuntimeListeners: facadeMocks.setupSelectionModeRuntimeListeners,
}));

import { createSelectionModeFacadeBindings } from './facade';

beforeEach(() => {
  vi.clearAllMocks();
});

function createScenario() {
  const session = createSelectionModeSession();
  const runtimeArgs = { state: session } as never;
  const runtimeEvents = {
    cancelSelection: vi.fn(),
    confirmSelection: vi.fn(),
    constrainSelection: vi.fn(),
    resetToIdleState: vi.fn(),
    updateFinalFrame: vi.fn(),
  };
  const runtimeFacade = { facade: true };
  facadeMocks.createSelectionModeRuntimeFacade.mockReturnValue(runtimeFacade);

  const result = createSelectionModeFacadeBindings({
    cleanup: vi.fn(),
    getRuntimeArgs: () => runtimeArgs,
    getRuntimeEvents: () => runtimeEvents,
    session,
  });
  const args = facadeMocks.createSelectionModeRuntimeFacade.mock.calls[0]?.[0];
  if (!args) {
    throw new Error('Expected runtime facade args');
  }

  return { args, result, runtimeArgs, runtimeEvents, runtimeFacade, session };
}

describe('selection-mode controller facade bindings', () => {
  it('binds facade reads and writes to the exact session authority', () => {
    const scenario = createScenario();
    const selection = { x: 1, y: 2, width: 30, height: 40 };
    const rejectCallback = vi.fn();
    const resolveCallback = vi.fn();

    expect(scenario.args.state).toBe(scenario.session);
    scenario.args.setAspectRatio(1.5);
    scenario.args.setCurrentSelection(selection);
    scenario.args.setCurrentState('confirmed');
    scenario.args.setIsActive(true);
    scenario.args.setMaintainAspectRatio(true);
    scenario.args.setRejectCallback(rejectCallback);
    scenario.args.setResolveCallback(resolveCallback);

    expect(scenario.args.getAspectRatio()).toBe(1.5);
    expect(scenario.args.getCurrentSelection()).toBe(selection);
    expect(scenario.args.getIsActive()).toBe(true);
    expect(scenario.args.getMaintainAspectRatio()).toBe(true);
    expect(scenario.args.getRejectCallback()).toBe(rejectCallback);
    expect(scenario.session).toEqual(
      expect.objectContaining({
        currentState: 'confirmed',
        rejectCallback,
        resolveCallback,
      })
    );
  });

  it('forwards runtime events, listeners, and the latest DOM identity', () => {
    const scenario = createScenario();
    const nextDom = { marker: true } as never;
    scenario.session.dom = nextDom;

    scenario.args.cancelSelection();
    scenario.args.confirmSelection();
    scenario.args.constrainSelection();
    scenario.args.resetToIdleState();
    scenario.args.updateFinalFrame();
    scenario.args.setupRuntimeListeners();

    expect(scenario.args.getDom()).toBe(nextDom);
    expect(scenario.runtimeEvents.cancelSelection).toHaveBeenCalledOnce();
    expect(scenario.runtimeEvents.confirmSelection).toHaveBeenCalledOnce();
    expect(scenario.runtimeEvents.constrainSelection).toHaveBeenCalledOnce();
    expect(scenario.runtimeEvents.resetToIdleState).toHaveBeenCalledOnce();
    expect(scenario.runtimeEvents.updateFinalFrame).toHaveBeenCalledOnce();
    expect(facadeMocks.setupSelectionModeRuntimeListeners).toHaveBeenCalledWith(
      scenario.runtimeArgs
    );
    expect(scenario.result).toBe(scenario.runtimeFacade);
  });
});
