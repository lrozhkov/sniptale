import { beforeEach, expect, it, vi } from 'vitest';
import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import type { SelectionModeSession } from '../session';

const mocks = vi.hoisted(() => ({
  capturedRuntimeArgs: null as
    | Parameters<typeof import('../runtime/composition').createSelectionModeRuntime>[0]
    | null,
  createSelectionModeRuntime: vi.fn(),
  createSelectionModeSession: vi.fn(),
  deactivateOtherContentModes: vi.fn(),
  logSelectionModeDiag: vi.fn(),
  logSelectionModeError: vi.fn(),
  resetSelectionModeSession: vi.fn(),
  setContentModeEnabled: vi.fn(),
}));

vi.mock('../../../application/mode-session', () => ({
  deactivateOtherContentModes: mocks.deactivateOtherContentModes,
  setContentModeEnabled: mocks.setContentModeEnabled,
}));
vi.mock('../diag', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../diag')>()),
  logSelectionModeDiag: mocks.logSelectionModeDiag,
  logSelectionModeError: mocks.logSelectionModeError,
}));
vi.mock('../runtime/composition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/composition')>()),
  createSelectionModeRuntime: (
    args: Parameters<typeof import('../runtime/composition').createSelectionModeRuntime>[0]
  ) => {
    mocks.capturedRuntimeArgs = args;
    return mocks.createSelectionModeRuntime(args);
  },
}));
vi.mock('../session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session')>()),
  createSelectionModeSession: mocks.createSelectionModeSession,
  resetSelectionModeSession: mocks.resetSelectionModeSession,
}));

import { createSelectionModeController } from '.';

function createSession(): SelectionModeSession {
  return {
    currentState: 'idle',
    isActive: false,
  } as SelectionModeSession;
}

function createRuntime(): {
  cleanupEffects: ReturnType<typeof vi.fn<() => void>>;
  disableSelectionMode: ReturnType<typeof vi.fn<() => void>>;
  enableSelectionMode: ReturnType<typeof vi.fn<() => Promise<CaptureArea>>>;
  isSelectionModeActive: ReturnType<typeof vi.fn<() => boolean>>;
} {
  return {
    cleanupEffects: vi.fn<() => void>(),
    disableSelectionMode: vi.fn<() => void>(),
    enableSelectionMode: vi.fn<() => Promise<CaptureArea>>(),
    isSelectionModeActive: vi.fn<() => boolean>(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.capturedRuntimeArgs = null;
  mocks.createSelectionModeSession.mockReturnValue(createSession());
  mocks.createSelectionModeRuntime.mockReturnValue(createRuntime());
});

it('creates one runtime composition around the controller session', () => {
  const session = createSession();
  mocks.createSelectionModeSession.mockReturnValue(session);

  createSelectionModeController();

  expect(mocks.capturedRuntimeArgs?.session).toBe(session);
  expect(mocks.capturedRuntimeArgs?.cleanup).toEqual(expect.any(Function));
});

it('delegates public actions through the narrow runtime contract', async () => {
  const area = { x: 10, y: 20, width: 300, height: 200 };
  const runtime = createRuntime();
  runtime.enableSelectionMode.mockResolvedValue(area);
  runtime.isSelectionModeActive.mockReturnValue(true);
  mocks.createSelectionModeRuntime.mockReturnValue(runtime);
  const controller = createSelectionModeController();

  await expect(controller.enableSelectionMode()).resolves.toEqual(area);
  controller.disableSelectionMode();
  expect(controller.isSelectionModeActive()).toBe(true);

  expect(runtime.enableSelectionMode).toHaveBeenCalledOnce();
  expect(runtime.disableSelectionMode).toHaveBeenCalledOnce();
  expect(runtime.isSelectionModeActive).toHaveBeenCalledOnce();
  expect(mocks.deactivateOtherContentModes).toHaveBeenCalledWith('selection-mode');
  expect(mocks.setContentModeEnabled).toHaveBeenCalledWith('selection-mode', true);
});

it('cleans runtime effects before resetting session and mode ownership', () => {
  const session = createSession();
  const runtime = createRuntime();
  mocks.createSelectionModeSession.mockReturnValue(session);
  mocks.createSelectionModeRuntime.mockReturnValue(runtime);
  const controller = createSelectionModeController();

  controller.cleanup();

  expect(runtime.cleanupEffects).toHaveBeenCalledOnce();
  expect(mocks.resetSelectionModeSession).toHaveBeenCalledWith(session);
  expect(mocks.setContentModeEnabled).toHaveBeenCalledWith('selection-mode', false);
  expect(mocks.logSelectionModeDiag).toHaveBeenNthCalledWith(1, 'cleanup.start');
  expect(mocks.logSelectionModeDiag).toHaveBeenNthCalledWith(2, 'cleanup.complete');
});

it('resets session ownership and mode flags when runtime cleanup fails', () => {
  const error = new Error('runtime cleanup failed');
  const session = createSession();
  const runtime = createRuntime();
  runtime.cleanupEffects.mockImplementation(() => {
    throw error;
  });
  mocks.createSelectionModeSession.mockReturnValue(session);
  mocks.createSelectionModeRuntime.mockReturnValue(runtime);
  const controller = createSelectionModeController();

  expect(() => controller.cleanup()).toThrow(error);
  expect(mocks.resetSelectionModeSession).toHaveBeenCalledWith(session);
  expect(mocks.setContentModeEnabled).toHaveBeenCalledWith('selection-mode', false);
  expect(mocks.logSelectionModeError).toHaveBeenCalledWith('cleanup.failed', error);
});
