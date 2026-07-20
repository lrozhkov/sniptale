import { beforeEach, expect, it, vi } from 'vitest';

import { createSelectionModeController } from '.';
import type { SelectionModeState } from '../session/state';
import type { SelectionModeSession } from '../session/locals/contract';
import {
  createCapturedFacadeBindingsBase,
  createCapturedRuntimeGraphBindingsArgs,
  createSelectionModeEventsMock,
  createSelectionModeRuntimeFacadeMock,
  createSelectionModeStateMock,
} from './index.test-support';

function createCapturedFacadeBindingsArgs(args: {
  getRuntimeArgs: () => { state: unknown };
  getRuntimeEvents: Parameters<typeof createCapturedFacadeBindingsBase>[0]['getRuntimeEvents'];
  session: Parameters<typeof createCapturedFacadeBindingsBase>[0]['session'];
}) {
  return {
    ...createCapturedFacadeBindingsBase(args),
    setupRuntimeListeners: () => mocks.setupSelectionModeRuntimeListeners(args.getRuntimeArgs()),
  };
}

type CapturedFacadeBindingsArgs = ReturnType<typeof createCapturedFacadeBindingsArgs>;
type CapturedRuntimeGraphArgs = ReturnType<typeof createCapturedRuntimeGraphBindingsArgs>;

const mocks = vi.hoisted(() => {
  return {
    capturedFacadeArgs: null as CapturedFacadeBindingsArgs | null,
    capturedRuntimeGraphArgs: null as CapturedRuntimeGraphArgs | null,
    deactivateOtherContentModes: vi.fn(),
    logSelectionModeDiag: vi.fn(),
    logSelectionModeError: vi.fn(),
    mutableRefs: {},
    session: null as SelectionModeSession | null,
    createSelectionModeSession: vi.fn(),
    resetSelectionModeSession: vi.fn(),
    runtimeFacade: null as ReturnType<typeof createSelectionModeRuntimeFacadeMock> | null,
    selectionModeEvents: null as ReturnType<typeof createSelectionModeEventsMock> | null,
    selectionModeRuntimeArgs: { state: {} },
    setContentModeEnabled: vi.fn(),
    setupSelectionModeRuntimeListeners: vi.fn(),
    state: null as SelectionModeState | null,
  };
});

function runtimeFacade() {
  return mocks.runtimeFacade!;
}

function selectionModeEvents() {
  return mocks.selectionModeEvents!;
}

vi.mock('../../../application/mode-session', () => ({
  deactivateOtherContentModes: mocks.deactivateOtherContentModes,
  setContentModeEnabled: mocks.setContentModeEnabled,
}));

vi.mock('../diag', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../diag')>()),
  logSelectionModeDiag: mocks.logSelectionModeDiag,
  logSelectionModeError: mocks.logSelectionModeError,
}));

vi.mock('../interaction/actions/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../interaction/actions/runtime')>()),
  setupSelectionModeRuntimeListeners: mocks.setupSelectionModeRuntimeListeners,
}));

vi.mock('../session/state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session/state')>()),
  createSelectionModeState: () => mocks.state!,
}));

vi.mock('../session', () => ({
  createSelectionModeSession: mocks.createSelectionModeSession,
  resetSelectionModeSession: mocks.resetSelectionModeSession,
}));

vi.mock('../session/locals/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session/locals/helpers')>()),
  createSelectionModeSessionMutableRefs: () => mocks.mutableRefs,
}));

vi.mock('./runtime-bindings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime-bindings')>()),
  createSelectionModeFacadeBindings: (
    args: Parameters<typeof import('./runtime-bindings').createSelectionModeFacadeBindings>[0]
  ) => {
    mocks.capturedFacadeArgs = createCapturedFacadeBindingsArgs({
      getRuntimeArgs: args.getRuntimeArgs,
      getRuntimeEvents: args.getRuntimeEvents,
      session: args.session,
    }) as never;
    return mocks.runtimeFacade!;
  },
  createSelectionModeRuntimeBindings: (
    args: Parameters<typeof import('./runtime-bindings').createSelectionModeRuntimeBindings>[0]
  ) => {
    mocks.capturedRuntimeGraphArgs = createCapturedRuntimeGraphBindingsArgs({
      runtimeFacade: args.runtimeFacade,
      session: args.session,
      updateFinalFrame: args.updateFinalFrame,
    }) as never;
    return {
      selectionModeEvents: mocks.selectionModeEvents!,
      selectionModeRuntimeArgs: mocks.selectionModeRuntimeArgs,
    };
  },
}));

beforeEach(() => {
  mocks.capturedFacadeArgs = null;
  mocks.capturedRuntimeGraphArgs = null;
  mocks.deactivateOtherContentModes.mockReset();
  mocks.setContentModeEnabled.mockReset();
  mocks.logSelectionModeDiag.mockReset();
  mocks.logSelectionModeError.mockReset();
  mocks.setupSelectionModeRuntimeListeners.mockReset();
  mocks.resetSelectionModeSession.mockReset();
  mocks.createSelectionModeSession.mockReset();
  mocks.runtimeFacade = createSelectionModeRuntimeFacadeMock();
  mocks.selectionModeEvents = createSelectionModeEventsMock();
  mocks.state = createSelectionModeStateMock();
  mocks.session = createSelectionModeStateMock() as SelectionModeSession;
  mocks.createSelectionModeSession.mockReturnValue(mocks.session);
});

it('enables selection mode through the controller-owned facade lifecycle', async () => {
  const area = { x: 10, y: 20, width: 300, height: 200 };
  runtimeFacade().enableSelectionMode.mockResolvedValue(area);
  const controller = createSelectionModeController();

  await expect(controller.enableSelectionMode()).resolves.toEqual(area);

  expect(mocks.logSelectionModeDiag).toHaveBeenCalledWith('enableSelectionMode.requested');
  expect(mocks.deactivateOtherContentModes).toHaveBeenCalledWith('selection-mode');
  expect(mocks.setContentModeEnabled).toHaveBeenCalledWith('selection-mode', true);
  expect(runtimeFacade().enableSelectionMode).toHaveBeenCalledTimes(1);
});

it('disables selection mode through the same runtime facade instance', () => {
  const controller = createSelectionModeController();

  controller.disableSelectionMode();

  expect(mocks.logSelectionModeDiag).toHaveBeenCalledWith('disableSelectionMode.requested');
  expect(runtimeFacade().disableSelectionMode).toHaveBeenCalledTimes(1);
});

it('exposes activity through the runtime facade and keeps runtime listeners wired lazily', () => {
  runtimeFacade().isSelectionModeActive.mockReturnValue(true);
  const controller = createSelectionModeController();

  expect(controller.isSelectionModeActive()).toBe(true);
  mocks.capturedFacadeArgs?.setupRuntimeListeners();

  expect(mocks.setupSelectionModeRuntimeListeners).toHaveBeenCalledWith(
    mocks.selectionModeRuntimeArgs
  );
});

it('keeps facade bindings synchronized with session-owned state and runtime events', () => {
  createSelectionModeController();
  const rejectCallback = vi.fn();
  const resolveCallback = vi.fn();
  const selection = { x: 11, y: 12, width: 130, height: 95 };

  mocks.capturedFacadeArgs?.setAspectRatio(16 / 9);
  mocks.capturedFacadeArgs?.setCurrentSelection(selection);
  mocks.capturedFacadeArgs?.setCurrentState('confirmed');
  mocks.capturedFacadeArgs?.setIsActive(true);
  mocks.capturedFacadeArgs?.setMaintainAspectRatio(true);
  mocks.capturedFacadeArgs?.setRejectCallback(rejectCallback);
  mocks.capturedFacadeArgs?.setResolveCallback(resolveCallback);
  mocks.capturedFacadeArgs?.cancelSelection();
  mocks.capturedFacadeArgs?.confirmSelection();
  mocks.capturedFacadeArgs?.constrainSelection();
  mocks.capturedFacadeArgs?.resetToIdleState();
  mocks.capturedFacadeArgs?.updateFinalFrame();

  expect(mocks.capturedFacadeArgs?.getAspectRatio()).toBe(16 / 9);
  expect(mocks.capturedFacadeArgs?.getCurrentSelection()).toEqual(selection);
  expect(mocks.capturedFacadeArgs?.getIsActive()).toBe(true);
  expect(mocks.capturedFacadeArgs?.getMaintainAspectRatio()).toBe(true);
  expect(mocks.capturedFacadeArgs?.getRejectCallback()).toBe(rejectCallback);
  expect(mocks.session?.currentState).toBe('confirmed');
  expect(mocks.session?.resolveCallback).toBe(resolveCallback);
  expect(selectionModeEvents().cancelSelection).toHaveBeenCalledTimes(1);
  expect(selectionModeEvents().confirmSelection).toHaveBeenCalledTimes(1);
  expect(selectionModeEvents().constrainSelection).toHaveBeenCalledTimes(1);
  expect(selectionModeEvents().resetToIdleState).toHaveBeenCalledTimes(1);
  expect(selectionModeEvents().updateFinalFrame).toHaveBeenCalledTimes(1);
});

it('keeps runtime graph bindings synchronized with session cleanup slots and callbacks', () => {
  createSelectionModeController();
  const eventCleanup = vi.fn();
  const scrollCleanup = vi.fn();
  const rejectCallback = vi.fn();
  const resolveCallback = vi.fn();
  const selection = { x: 21, y: 22, width: 180, height: 140 };

  if (!mocks.session) {
    throw new Error('Expected session');
  }

  mocks.session.currentSelection = selection;
  mocks.session.rejectCallback = rejectCallback;
  mocks.session.resolveCallback = resolveCallback;
  mocks.capturedRuntimeGraphArgs?.setCleanupEventListeners(eventCleanup);
  mocks.capturedRuntimeGraphArgs?.setCleanupScrollListeners(scrollCleanup);
  mocks.capturedRuntimeGraphArgs?.disableCursor();
  mocks.capturedRuntimeGraphArgs?.updateFinalFrame();

  expect(mocks.capturedRuntimeGraphArgs?.currentSelection()).toEqual(selection);
  expect(mocks.capturedRuntimeGraphArgs?.getRejectCallback()).toBe(rejectCallback);
  expect(mocks.capturedRuntimeGraphArgs?.getResolveCallback()).toBe(resolveCallback);
  expect(mocks.session.cleanupEventListeners).toBe(eventCleanup);
  expect(mocks.session.cleanupScrollListeners).toBe(scrollCleanup);
  expect(runtimeFacade().disableCursor).toHaveBeenCalledTimes(1);
  expect(selectionModeEvents().updateFinalFrame).toHaveBeenCalledTimes(1);
});

it('cleans up the session and mode state through the controller-owned cleanup closure', () => {
  const controller = createSelectionModeController();

  controller.cleanup();

  expect(mocks.logSelectionModeDiag).toHaveBeenNthCalledWith(1, 'cleanup.start');
  expect(selectionModeEvents().cleanup).toHaveBeenCalledTimes(1);
  expect(mocks.resetSelectionModeSession).toHaveBeenCalledWith(mocks.session);
  expect(mocks.setContentModeEnabled).toHaveBeenCalledWith('selection-mode', false);
  expect(mocks.logSelectionModeDiag).toHaveBeenNthCalledWith(2, 'cleanup.complete');
});

it('resets session ownership and mode flags even when runtime cleanup throws', () => {
  selectionModeEvents().cleanup.mockImplementation(() => {
    throw new Error('runtime cleanup failed');
  });
  const controller = createSelectionModeController();

  expect(() => controller.cleanup()).toThrow('runtime cleanup failed');
  expect(mocks.resetSelectionModeSession).toHaveBeenCalledWith(mocks.session);
  expect(mocks.setContentModeEnabled).toHaveBeenCalledWith('selection-mode', false);
  expect(mocks.logSelectionModeError).toHaveBeenCalledWith('cleanup.failed', expect.any(Error));
});
