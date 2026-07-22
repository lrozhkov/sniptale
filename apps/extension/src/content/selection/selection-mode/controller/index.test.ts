import { beforeEach, expect, it, vi } from 'vitest';

import { createSelectionModeController } from '.';
import type { SelectionModeRuntimeFacadeArgs } from '../runtime/facade/types';
import type { SelectionModeSession } from '../session';
import {
  createCapturedRuntimeGraphBindingsArgs,
  createSelectionModeEventsMock,
  createSelectionModeRuntimeFacadeMock,
  createSelectionModeSessionMock,
} from './index.test-support';

type CapturedRuntimeGraphArgs = ReturnType<typeof createCapturedRuntimeGraphBindingsArgs>;

const mocks = vi.hoisted(() => {
  return {
    capturedFacadeArgs: null as SelectionModeRuntimeFacadeArgs | null,
    capturedRuntimeGraphArgs: null as CapturedRuntimeGraphArgs | null,
    deactivateOtherContentModes: vi.fn(),
    logSelectionModeDiag: vi.fn(),
    logSelectionModeError: vi.fn(),
    session: null as SelectionModeSession | null,
    createSelectionModeSession: vi.fn(),
    resetSelectionModeSession: vi.fn(),
    runtimeFacade: null as ReturnType<typeof createSelectionModeRuntimeFacadeMock> | null,
    selectionModeEvents: null as ReturnType<typeof createSelectionModeEventsMock> | null,
    selectionModeRuntimeArgs: { state: {} },
    setContentModeEnabled: vi.fn(),
    setupSelectionModeRuntimeListeners: vi.fn(),
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

vi.mock('../runtime/facade', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/facade')>()),
  createSelectionModeRuntimeFacade: (args: SelectionModeRuntimeFacadeArgs) => {
    mocks.capturedFacadeArgs = args;
    return mocks.runtimeFacade!;
  },
}));

vi.mock('../session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session')>()),
  createSelectionModeSession: mocks.createSelectionModeSession,
  resetSelectionModeSession: mocks.resetSelectionModeSession,
}));

vi.mock('./runtime-bindings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime-bindings')>()),
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
  mocks.session = createSelectionModeSessionMock();
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

it('passes one session authority and lazy event delegates to the runtime facade', () => {
  createSelectionModeController();

  expect(mocks.capturedFacadeArgs?.session).toBe(mocks.session);
  expect(mocks.capturedRuntimeGraphArgs?.session).toBe(mocks.session);

  mocks.capturedFacadeArgs?.cancelSelection();
  mocks.capturedFacadeArgs?.confirmSelection();
  mocks.capturedFacadeArgs?.constrainSelection();
  mocks.capturedFacadeArgs?.resetToIdleState();
  mocks.capturedFacadeArgs?.setupRuntimeListeners();
  mocks.capturedFacadeArgs?.updateFinalFrame();

  expect(selectionModeEvents().cancelSelection).toHaveBeenCalledTimes(1);
  expect(selectionModeEvents().confirmSelection).toHaveBeenCalledTimes(1);
  expect(selectionModeEvents().constrainSelection).toHaveBeenCalledTimes(1);
  expect(selectionModeEvents().resetToIdleState).toHaveBeenCalledTimes(1);
  expect(selectionModeEvents().updateFinalFrame).toHaveBeenCalledTimes(1);
  expect(mocks.setupSelectionModeRuntimeListeners).toHaveBeenCalledWith(
    mocks.selectionModeRuntimeArgs
  );
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
