import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSelectionModeSession } from '../../session';

const runtimeMocks = vi.hoisted(() => ({
  createSelectionModeRuntimeGraphBindings: vi.fn(),
}));

vi.mock('../../runtime/graph-bindings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/graph-bindings')>()),
  createSelectionModeRuntimeGraphBindings: runtimeMocks.createSelectionModeRuntimeGraphBindings,
}));

import { createSelectionModeRuntimeBindings } from './runtime';
import type { SelectionModeRuntimeFacade } from '../../runtime/facade/types';

beforeEach(() => {
  vi.clearAllMocks();
});

function createScenario() {
  const session = createSelectionModeSession();
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
  runtimeMocks.createSelectionModeRuntimeGraphBindings.mockReturnValue(runtimeGraph);

  const result = createSelectionModeRuntimeBindings({
    cleanup: vi.fn(),
    runtimeFacade: runtimeFacade as SelectionModeRuntimeFacade,
    session,
    updateFinalFrame: vi.fn(),
  });
  const args = runtimeMocks.createSelectionModeRuntimeGraphBindings.mock.calls[0]?.[0];
  if (!args) {
    throw new Error('Expected runtime graph args');
  }

  return { args, result, runtimeFacade, runtimeGraph, session };
}

describe('selection-mode controller runtime bindings', () => {
  it('assembles the runtime graph around the exact session authority', () => {
    const scenario = createScenario();
    const selection = { x: 1, y: 2, width: 30, height: 40 };
    const rejectCallback = vi.fn();
    const resolveCallback = vi.fn();
    scenario.session.currentSelection = selection;
    scenario.session.rejectCallback = rejectCallback;
    scenario.session.resolveCallback = resolveCallback;

    expect(scenario.args.session).toBe(scenario.session);
    expect(scenario.args.currentSelection()).toBe(selection);
    expect(scenario.args.getRejectCallback()).toBe(rejectCallback);
    expect(scenario.args.getResolveCallback()).toBe(resolveCallback);
    expect(scenario.args.selectionModeUiRuntime).toBe(scenario.runtimeFacade.uiRuntime);
    expect(scenario.result).toBe(scenario.runtimeGraph);
  });

  it('keeps cleanup slots and cursor delegation on the same session graph', () => {
    const scenario = createScenario();
    const eventCleanup = vi.fn();
    const scrollCleanup = vi.fn();

    scenario.args.setCleanupEventListeners(eventCleanup);
    scenario.args.setCleanupScrollListeners(scrollCleanup);
    scenario.args.disableCursor();

    expect(scenario.session.cleanupEventListeners).toBe(eventCleanup);
    expect(scenario.session.cleanupScrollListeners).toBe(scrollCleanup);
    expect(scenario.runtimeFacade.disableCursor).toHaveBeenCalledOnce();
  });
});
