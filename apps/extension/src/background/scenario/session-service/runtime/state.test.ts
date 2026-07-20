import { beforeEach, expect, it, vi } from 'vitest';
import type { ScenarioRecorderSurfaceState } from '@sniptale/runtime-contracts/scenario/types/session';
import type { PendingScenarioCapture } from '../types';
import { createStoredPendingScenarioCapture } from '../test-support';

const { loggerWarnMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
}));

import { createScenarioSessionServiceClearTab, createScenarioSessionServiceState } from './state';

const { clearPendingScenarioCaptureAssetMock } = vi.hoisted(() => ({
  clearPendingScenarioCaptureAssetMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}));

vi.mock('../pending-assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pending-assets')>()),
  clearPendingScenarioCaptureAsset: clearPendingScenarioCaptureAssetMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  clearPendingScenarioCaptureAssetMock.mockResolvedValue(undefined);
});

function createPendingCapture(
  overrides: Partial<PendingScenarioCapture> = {}
): PendingScenarioCapture {
  return {
    ...createStoredPendingScenarioCapture(),
    ...overrides,
  };
}

function createSession() {
  return {
    captureMode: 'manual' as const,
    enabled: true,
    pendingProjectSelection: false,
    projectId: null,
    projectName: null,
    rememberProjectSelection: true,
    sidebarVisible: true,
  };
}

function createSurface(
  overrides: Partial<ScenarioRecorderSurfaceState> = {}
): ScenarioRecorderSurfaceState {
  return {
    captureAction: 'scenario',
    screenshotMode: true,
    toolbarVisible: true,
    ...overrides,
  };
}

it('creates isolated runtime state buckets for each session-service concern', () => {
  const state = createScenarioSessionServiceState();

  expect(state).toEqual({
    hydrationPromise: null,
    pendingCaptures: new Map(),
    revisions: new Map(),
    sessions: new Map(),
    surfaces: new Map(),
  });
});

it('clears session, surface, pending capture, and revision state for a tab', async () => {
  const state = createScenarioSessionServiceState();
  state.pendingCaptures.set(12, createPendingCapture({ id: 'capture-1' }));
  state.revisions.set(12, 4);
  state.sessions.set(12, createSession());
  state.surfaces.set(12, createSurface());

  const clearTab = createScenarioSessionServiceClearTab({
    ensureHydrated: vi.fn().mockResolvedValue(undefined),
    persistSessions: vi.fn().mockResolvedValue(undefined),
    runPersistedWrite: vi.fn((task) => task()),
    state,
  });
  await clearTab(12);

  expect(state.pendingCaptures.has(12)).toBe(false);
  expect(state.revisions.has(12)).toBe(false);
  expect(state.sessions.has(12)).toBe(false);
  expect(state.surfaces.has(12)).toBe(false);
  expect(clearPendingScenarioCaptureAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'capture-1' })
  );
});

it('restores tab state when persisted tab cleanup fails', async () => {
  const state = createScenarioSessionServiceState();
  const pendingCapture = createPendingCapture({ id: 'capture-1' });
  const session = createSession();
  const surface = createSurface();
  const persistError = new Error('persist failed');

  state.pendingCaptures.set(12, pendingCapture);
  state.revisions.set(12, 4);
  state.sessions.set(12, session);
  state.surfaces.set(12, surface);

  const clearTab = createScenarioSessionServiceClearTab({
    ensureHydrated: vi.fn().mockResolvedValue(undefined),
    persistSessions: vi.fn().mockRejectedValue(persistError),
    runPersistedWrite: vi.fn((task) => task()),
    state,
  });

  await expect(clearTab(12)).rejects.toThrow('persist failed');

  expect(state.pendingCaptures.get(12)).toBe(pendingCapture);
  expect(state.revisions.has(12)).toBe(false);
  expect(state.sessions.get(12)).toBe(session);
  expect(state.surfaces.get(12)).toBe(surface);
  expect(clearPendingScenarioCaptureAssetMock).not.toHaveBeenCalled();
});

it('clears a tab without pending state or revision metadata', async () => {
  const state = createScenarioSessionServiceState();
  const clearTab = createScenarioSessionServiceClearTab({
    ensureHydrated: vi.fn().mockResolvedValue(undefined),
    persistSessions: vi.fn().mockResolvedValue(undefined),
    runPersistedWrite: vi.fn((task) => task()),
    state,
  });

  await expect(clearTab(99)).resolves.toBeUndefined();

  expect(clearPendingScenarioCaptureAssetMock).toHaveBeenCalledWith(null);
  expect(state.pendingCaptures.has(99)).toBe(false);
  expect(state.revisions.has(99)).toBe(false);
});

it('logs pending-asset cleanup failures after persisted tab cleanup succeeds', async () => {
  const state = createScenarioSessionServiceState();
  const pendingCapture = createPendingCapture({ pendingAssetId: 'pending-asset-1' });
  const cleanupError = new Error('delete failed');

  state.pendingCaptures.set(12, pendingCapture);
  clearPendingScenarioCaptureAssetMock.mockRejectedValueOnce(cleanupError);

  const clearTab = createScenarioSessionServiceClearTab({
    ensureHydrated: vi.fn().mockResolvedValue(undefined),
    persistSessions: vi.fn().mockResolvedValue(undefined),
    runPersistedWrite: vi.fn((task) => task()),
    state,
  });

  await expect(clearTab(12)).resolves.toBeUndefined();

  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to clear pending capture during tab cleanup',
    {
      error: cleanupError,
      pendingAssetId: 'pending-asset-1',
      tabId: 12,
    }
  );
});

it('keeps empty optional buckets empty when persisted tab cleanup fails', async () => {
  const state = createScenarioSessionServiceState();
  const persistError = new Error('persist failed');

  state.revisions.set(12, 4);

  const clearTab = createScenarioSessionServiceClearTab({
    ensureHydrated: vi.fn().mockResolvedValue(undefined),
    persistSessions: vi.fn().mockRejectedValue(persistError),
    runPersistedWrite: vi.fn((task) => task()),
    state,
  });

  await expect(clearTab(12)).rejects.toThrow('persist failed');

  expect(state.pendingCaptures.has(12)).toBe(false);
  expect(state.sessions.has(12)).toBe(false);
  expect(state.surfaces.has(12)).toBe(false);
  expect(state.revisions.has(12)).toBe(false);
});
