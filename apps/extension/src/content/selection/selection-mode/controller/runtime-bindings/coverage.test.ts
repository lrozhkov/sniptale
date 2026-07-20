// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { createSelectionModeRuntimeArgs } from '../runtime';
import { createSelectionModeState } from '../../session/state';
import type { SelectionModeRuntimeGraphBindingsArgs } from '../../runtime/graph-bindings';
import type {
  SelectionModeRuntimeFacade,
  SelectionModeRuntimeFacadeArgs,
} from '../../runtime/facade/types';
import type { SelectionModeSession } from '../../session/locals/helpers';
import type { Selection } from '../../types';

const mocks = vi.hoisted(() => ({
  createRuntimeFacadeMock: vi.fn((args) => args),
  createRuntimeGraphBindingsMock: vi.fn((args) => args),
  createSessionSettersMock: vi.fn((session) => ({
    setAspectRatio: vi.fn((value) => {
      session.aspectRatio = value;
    }),
    setCleanupEventListeners: vi.fn(),
    setCleanupScrollListeners: vi.fn(),
    setCurrentSelection: vi.fn((value) => {
      session.currentSelection = value;
    }),
    setCurrentState: vi.fn(),
    setIsActive: vi.fn((value) => {
      session.isActive = value;
    }),
    setMaintainAspectRatio: vi.fn((value) => {
      session.maintainAspectRatio = value;
    }),
    setRejectCallback: vi.fn((value) => {
      session.rejectCallback = value;
    }),
    setResolveCallback: vi.fn((value) => {
      session.resolveCallback = value;
    }),
  })),
  setupRuntimeListenersMock: vi.fn(),
}));

vi.mock('../../runtime/facade', () => ({
  createSelectionModeRuntimeFacade: mocks.createRuntimeFacadeMock,
}));

vi.mock('../../interaction/actions/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../interaction/actions/runtime')>()),
  setupSelectionModeRuntimeListeners: mocks.setupRuntimeListenersMock,
}));

vi.mock('../../session/locals/setters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session/locals/setters')>()),
  createSelectionModeSessionLocalSetters: mocks.createSessionSettersMock,
}));

vi.mock('../../runtime/graph-bindings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/graph-bindings')>()),
  createSelectionModeRuntimeGraphBindings: mocks.createRuntimeGraphBindingsMock,
}));

import { createSelectionModeFacadeBindings } from './facade';
import { createSelectionModeRuntimeBindings } from './runtime';

function createSession(): SelectionModeSession {
  return createSelectionModeState();
}

function getRuntimeFacadeArgs(): SelectionModeRuntimeFacadeArgs {
  const firstCall = mocks.createRuntimeFacadeMock.mock.calls[0];
  if (!firstCall) {
    throw new Error('Expected selection-mode runtime facade factory call');
  }
  return firstCall[0];
}

function getRuntimeGraphArgs(): SelectionModeRuntimeGraphBindingsArgs {
  const firstCall = mocks.createRuntimeGraphBindingsMock.mock.calls[0];
  if (!firstCall) {
    throw new Error('Expected selection-mode runtime graph factory call');
  }
  return firstCall[0];
}

function createRuntimeListenerArgs(session: SelectionModeSession) {
  return createSelectionModeRuntimeArgs({
    createDragFrame: vi.fn(),
    getMaxSelectionHeight: vi.fn(() => 600),
    getMaxSelectionWidth: vi.fn(() => 800),
    handleClick: vi.fn(),
    handleKeyDown: vi.fn(),
    handleMouseDown: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleMouseMove: vi.fn(),
    handleMouseUp: vi.fn(),
    minSelectionSize: 32,
    refs: session,
    setCleanupEventListeners: vi.fn(),
    setCleanupScrollListeners: vi.fn(),
    showFinalFrame: vi.fn(),
    updateFinalFrame: vi.fn(),
    zIndexBase: 500,
  });
}

function createRuntimeFacade(): SelectionModeRuntimeFacade {
  return {
    disableCursor: vi.fn(),
    disableSelectionMode: vi.fn(),
    enableSelectionMode: vi.fn(),
    isSelectionModeActive: vi.fn(),
    setupSizePanelListeners: vi.fn(),
    uiRuntime: {
      createDragFrame: vi.fn(),
      createFinalElements: vi.fn(),
      createHoverElements: vi.fn(),
      createOverlayContainer: vi.fn(),
      prepare: vi.fn(),
    },
    zIndexBase: 500,
  };
}

function createSelection(overrides: Partial<Selection> = {}): Selection {
  return {
    height: 40,
    width: 80,
    x: 10,
    y: 20,
    ...overrides,
  };
}

function createRuntimeEvents() {
  return {
    cancelSelection: vi.fn(),
    confirmSelection: vi.fn(),
    constrainSelection: vi.fn(),
    resetToIdleState: vi.fn(),
    updateFinalFrame: vi.fn(),
  };
}

function createFacadeBindingScenario() {
  const session = createSession();
  const events = createRuntimeEvents();
  const runtimeListenerArgs = createRuntimeListenerArgs(session);

  createSelectionModeFacadeBindings({
    cleanup: vi.fn(),
    getRuntimeArgs: () => runtimeListenerArgs,
    getRuntimeEvents: () => events,
    session,
    state: createSelectionModeState(),
  });

  return { events, facade: getRuntimeFacadeArgs(), runtimeListenerArgs, session };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('creates facade bindings that forward runtime events and session setters', () => {
  const { events, facade, runtimeListenerArgs, session } = createFacadeBindingScenario();
  const nextSelection = createSelection({ width: 10 });

  facade.confirmSelection();
  facade.cancelSelection();
  facade.constrainSelection();
  facade.resetToIdleState();
  facade.updateFinalFrame();
  facade.setAspectRatio(2);
  facade.setCurrentSelection(nextSelection);
  facade.setIsActive(true);
  facade.setMaintainAspectRatio(true);
  facade.setRejectCallback(() => 'reject');
  facade.setResolveCallback(() => 'resolve');
  facade.setupRuntimeListeners();

  expect(events.cancelSelection).toHaveBeenCalledOnce();
  expect(events.confirmSelection).toHaveBeenCalledOnce();
  expect(events.constrainSelection).toHaveBeenCalledOnce();
  expect(events.resetToIdleState).toHaveBeenCalledOnce();
  expect(events.updateFinalFrame).toHaveBeenCalledOnce();
  expect(session.aspectRatio).toBe(2);
  expect(session.currentSelection).toEqual(nextSelection);
  expect(session.isActive).toBe(true);
  expect(session.maintainAspectRatio).toBe(true);
  expect(typeof session.rejectCallback).toBe('function');
  expect(typeof session.resolveCallback).toBe('function');
  expect(facade.getAspectRatio()).toBe(2);
  expect(facade.getCurrentSelection()).toEqual(nextSelection);
  expect(facade.getIsActive()).toBe(true);
  expect(facade.getMaintainAspectRatio()).toBe(true);
  expect(facade.getRejectCallback()).toBe(session.rejectCallback);
  expect(mocks.setupRuntimeListenersMock).toHaveBeenCalledWith(runtimeListenerArgs);
});

it('creates runtime bindings that expose session getters and facade delegates', () => {
  const session = createSession();
  const currentSelection = createSelection({ width: 20 });
  session.currentSelection = currentSelection;
  session.rejectCallback = () => 'reject';
  session.resolveCallback = () => 'resolve';
  const runtimeFacade = createRuntimeFacade();
  createSelectionModeRuntimeBindings({
    cleanup: vi.fn(),
    mutableRefs: createSelectionModeState(),
    runtimeFacade,
    session,
    state: createSelectionModeState(),
    updateFinalFrame: vi.fn(),
  });
  const runtime = getRuntimeGraphArgs();

  expect(runtime.currentSelection()).toEqual(currentSelection);
  runtime.disableCursor();
  expect(runtime.getRejectCallback()).toBe(session.rejectCallback);
  expect(runtime.getResolveCallback()).toBe(session.resolveCallback);
  expect(runtime.getMaxSelectionHeight()).toBe(window.innerHeight);
  expect(runtime.getMaxSelectionWidth()).toBe(window.innerWidth);
  expect(runtime.selectionModeUiRuntime).toBe(runtimeFacade.uiRuntime);
  expect(runtime.minSelectionSize).toBeGreaterThan(0);
  expect(runtimeFacade.disableCursor).toHaveBeenCalledOnce();
});
