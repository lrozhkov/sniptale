import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  disableScreenshotMode: vi.fn(),
  erasePagePackageJobState: vi.fn(),
  getQuickActionTabIds: vi.fn(),
  getSessionTabIds: vi.fn(),
  hasOwnerLease: vi.fn(),
  readJournal: vi.fn(),
  releaseOwners: vi.fn(),
}));

vi.mock('../../capture/page-package/job', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture/page-package/job')>()),
  erasePopupExportJobState: mocks.erasePagePackageJobState,
}));

vi.mock('../../capture/quick-actions/flow/surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture/quick-actions/flow/surface')>()),
  getQuickActionSurfaceTransactionTabIds: mocks.getQuickActionTabIds,
}));
vi.mock('../../capture-surface/screenshot-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture-surface/screenshot-session')>()),
  getScreenshotSurfaceSessionTabIds: mocks.getSessionTabIds,
}));
vi.mock('../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture-surface')>()),
  getCaptureSurfaceService: () => ({
    hasOwnerLease: mocks.hasOwnerLease,
    releaseOwners: mocks.releaseOwners,
  }),
}));
vi.mock('../../storage/capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage/capture-surface')>()),
  readCaptureSurfaceJournal: mocks.readJournal,
}));

import { createBackgroundRuntimeState } from '../runtime-state';
import {
  backgroundRuntimeCleanupAdapter,
  configureBackgroundRuntimeScreenshotCleanupPort,
} from './runtime-cleanup';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.disableScreenshotMode.mockResolvedValue(undefined);
  mocks.erasePagePackageJobState.mockResolvedValue(undefined);
  mocks.getQuickActionTabIds.mockReturnValue([]);
  mocks.getSessionTabIds.mockReturnValue([]);
  mocks.hasOwnerLease.mockReturnValue(false);
  mocks.readJournal.mockResolvedValue([]);
  mocks.releaseOwners.mockResolvedValue(undefined);
  configureBackgroundRuntimeScreenshotCleanupPort({
    disableScreenshotMode: mocks.disableScreenshotMode,
  });
});

it('resets reconstructible, disposable, and durable background runtime state', async () => {
  const state = createBackgroundRuntimeState();
  state.screenshotModeState.set(7, true);
  state.highlighterModeState.set(7, true);
  state.quickEditModeState.set(7, true);
  state.viewportState.set(7, {
    presetId: 'test:viewport',
    target: 'window' as const,
    height: 600,
    width: 800,
  });
  state.captureGuardState.isCapturing = true;
  const previousScenarioSessionService = state.scenarioSessionService;

  const result = await backgroundRuntimeCleanupAdapter.cleanup(state);

  expect(result).toEqual([
    {
      id: 'background-runtime-state',
      remainingCount: 0,
      severity: 'required',
      status: 'verified-empty',
    },
  ]);
  expect(state.screenshotModeState.size).toBe(0);
  expect(state.highlighterModeState.size).toBe(0);
  expect(state.quickEditModeState.size).toBe(0);
  expect(state.viewportState.size).toBe(0);
  expect(state.captureGuardState.isCapturing).toBe(false);
  expect(state.scenarioSessionService).not.toBe(previousScenarioSessionService);
});

it('fails closed without resetting runtime state when screenshot authority remains', async () => {
  const state = createBackgroundRuntimeState();
  state.highlighterModeState.set(7, true);
  mocks.readJournal.mockResolvedValueOnce([{ owner: 'screenshot' }]);

  await expect(backgroundRuntimeCleanupAdapter.cleanup(state)).resolves.toEqual([
    expect.objectContaining({
      error: 'background-capture-surface-verification-failed',
      status: 'failed',
    }),
  ]);
  expect(state.highlighterModeState.get(7)).toBe(true);
});
