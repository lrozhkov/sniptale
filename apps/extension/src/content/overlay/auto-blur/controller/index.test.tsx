// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_BLUR_CATEGORIES,
  type AutoBlurSettings,
} from '../../../../features/highlighter/contracts/auto-blur';
import type { AutoBlurMatch } from '../../../selection/auto-blur-runtime';
import type { AutoBlurFrameManager } from './operations';

const controllerMocks = vi.hoisted(() => ({
  defaultSettings: {
    autoApplyEnabled: false,
    selectedCategories: ['email'],
    blurSettings: {
      amount: 10,
      blurType: 'solid',
      showBorder: false,
    },
  } satisfies AutoBlurSettings,
  getLoadedAutoBlurSettingsSnapshot: vi.fn(),
  loadAutoBlurSettings: vi.fn(),
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
  saveAutoBlurSettings: vi.fn(),
  scanAutoBlurTargets: vi.fn(),
}));

vi.mock('../persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../persistence')>()),
  DEFAULT_AUTO_BLUR_SETTINGS: controllerMocks.defaultSettings,
  getLoadedAutoBlurSettingsSnapshot: controllerMocks.getLoadedAutoBlurSettingsSnapshot,
  loadAutoBlurSettings: controllerMocks.loadAutoBlurSettings,
  saveAutoBlurSettings: controllerMocks.saveAutoBlurSettings,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => controllerMocks.logger,
}));

vi.mock('../../../selection/auto-blur-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/auto-blur-runtime')>()),
  scanAutoBlurTargets: controllerMocks.scanAutoBlurTargets,
}));

import { type AutoBlurController, useAutoBlurController } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestController: AutoBlurController | null = null;
let frameManager: AutoBlurFrameManager;
let syncAutoBlurFrameCalls: unknown[];

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | null = null;
  let rejectPromise: ((reason?: unknown) => void) | null = null;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: (reason?: unknown) => rejectPromise?.(reason),
    resolve: (value: T) => resolvePromise?.(value),
  };
}

function createMatch(overrides: Partial<AutoBlurMatch> = {}): AutoBlurMatch {
  return {
    alreadyBlurred: false,
    category: AUTO_BLUR_CATEGORIES.email,
    confidence: 0.9,
    element: document.createElement('span'),
    id: 'email-match',
    rect: { height: 16, width: 90, x: 10, y: 20 },
    value: 'john@example.com',
    ...overrides,
  };
}

function Harness({
  autoApplyAllowed = true,
  highlighterMode = true,
}: {
  autoApplyAllowed?: boolean;
  highlighterMode?: boolean;
}) {
  latestController = useAutoBlurController({
    autoApplyAllowed,
    frameManager,
    highlighterMode,
  });
  return null;
}

async function renderHarness(highlighterMode = true, autoApplyAllowed = true) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness autoApplyAllowed={autoApplyAllowed} highlighterMode={highlighterMode} />);
  });
}

async function openAndFlushScan() {
  await act(async () => {
    latestController?.open();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function setupDefaultControllerMocks() {
  controllerMocks.getLoadedAutoBlurSettingsSnapshot.mockReturnValue(
    controllerMocks.defaultSettings
  );
  controllerMocks.loadAutoBlurSettings.mockResolvedValue(controllerMocks.defaultSettings);
  controllerMocks.saveAutoBlurSettings.mockResolvedValue(undefined);
  controllerMocks.scanAutoBlurTargets.mockResolvedValue({
    matches: [
      createMatch(),
      createMatch({
        category: AUTO_BLUR_CATEGORIES.phone,
        id: 'phone-match',
        value: '+7 999 123-45-67',
      }),
      createMatch({ alreadyBlurred: true, id: 'blurred-email-match' }),
    ],
  });
  syncAutoBlurFrameCalls = [];
  frameManager = {
    clearAutoBlurFrames: vi.fn(),
    frames: [],
    syncAutoBlurFrames(input) {
      syncAutoBlurFrameCalls.push(input);
      return { addedCount: 0, removedCount: 0, skippedCount: 0 };
    },
  };
}

async function expectOpenScanApplyFlow() {
  await renderHarness();
  await openAndFlushScan();

  expect(latestController?.status).toBe('ready');
  expect(latestController?.selectedCategories.has(AUTO_BLUR_CATEGORIES.email)).toBe(true);

  await act(async () => {
    latestController?.toggleMatch('phone-match');
  });
  await act(async () => {
    await latestController?.apply();
  });

  expect(controllerMocks.saveAutoBlurSettings).toHaveBeenCalledWith(
    controllerMocks.defaultSettings
  );
  expect(syncAutoBlurFrameCalls).toContainEqual({
    blurSettings: controllerMocks.defaultSettings.blurSettings,
    targets: [
      expect.objectContaining({ id: 'email-match' }),
      expect.objectContaining({ id: 'phone-match' }),
    ],
  });
  expect(latestController?.isOpen).toBe(false);
}

async function expectChildExclusionFlow() {
  await renderHarness();
  await openAndFlushScan();

  await act(async () => {
    latestController?.toggleMatch('email-match');
  });
  await act(async () => {
    await latestController?.apply();
  });

  expect(syncAutoBlurFrameCalls).toContainEqual({
    blurSettings: controllerMocks.defaultSettings.blurSettings,
    targets: [],
  });
}

async function expectModeCloseFlow() {
  await renderHarness();
  await openAndFlushScan();
  expect(latestController?.isOpen).toBe(true);

  await renderHarness(false);

  expect(latestController?.isOpen).toBe(false);
}

async function expectAutoApplyAllowedGate() {
  vi.useFakeTimers();
  const enabledSettings = {
    ...controllerMocks.defaultSettings,
    autoApplyEnabled: true,
  };
  controllerMocks.loadAutoBlurSettings.mockResolvedValue(enabledSettings);

  await renderHarness(true, true);
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    vi.advanceTimersByTime(300);
    await Promise.resolve();
  });

  expect(syncAutoBlurFrameCalls).toHaveLength(1);

  syncAutoBlurFrameCalls = [];
  await renderHarness(true, false);
  await act(async () => {
    await Promise.resolve();
    vi.advanceTimersByTime(300);
  });

  expect(syncAutoBlurFrameCalls).toHaveLength(0);
}

async function expectPersistenceBeforeClose() {
  const persistence = createDeferred<void>();
  controllerMocks.saveAutoBlurSettings.mockReturnValue(persistence.promise);
  await renderHarness();
  await openAndFlushScan();

  let applyPromise: Promise<void> | undefined;
  await act(async () => {
    applyPromise = latestController?.apply();
    await Promise.resolve();
  });

  expect(latestController?.isApplying).toBe(true);
  expect(latestController?.isOpen).toBe(true);
  expect(syncAutoBlurFrameCalls).toHaveLength(0);

  await act(async () => {
    persistence.resolve(undefined);
    await applyPromise;
  });

  expect(syncAutoBlurFrameCalls).toHaveLength(1);
  expect(latestController?.isOpen).toBe(false);
  expect(latestController?.isApplying).toBe(false);
}

async function expectStaleScanIgnoredAfterClose() {
  const scan = createDeferred<{ matches: AutoBlurMatch[] }>();
  controllerMocks.scanAutoBlurTargets.mockReturnValue(scan.promise);
  await renderHarness();

  await act(async () => {
    latestController?.open();
    await Promise.resolve();
  });
  act(() => latestController?.close());
  await act(async () => {
    scan.resolve({ matches: [createMatch({ id: 'late-match' })] });
    await scan.promise;
    await Promise.resolve();
  });

  expect(latestController?.isOpen).toBe(false);
  expect(latestController?.matches).toEqual([]);
}

describe('useAutoBlurController', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    setupDefaultControllerMocks();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    latestController = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('scans visible targets on open and applies selected non-duplicate blur frames', async () => {
    await expectOpenScanApplyFlow();
  });

  it('lets a selected parent category exclude an individual child row', async () => {
    await expectChildExclusionFlow();
  });

  it('keeps category, all-selection, and blur-setting transitions in one session authority', async () => {
    await renderHarness();
    await openAndFlushScan();

    act(() => latestController?.toggleMatch('email-match'));
    act(() => latestController?.toggleCategory(AUTO_BLUR_CATEGORIES.email));
    expect(latestController?.selectedCategories.has(AUTO_BLUR_CATEGORIES.email)).toBe(false);
    expect(latestController?.selectedMatchIds).toEqual(new Set());

    act(() => latestController?.toggleAllSelection());
    expect(latestController?.selectedCategories.size).toBe(
      Object.keys(AUTO_BLUR_CATEGORIES).length
    );
    act(() => latestController?.toggleAllSelection());
    expect(latestController?.selectedCategories).toEqual(new Set());

    act(() =>
      latestController?.setBlurSettings({ amount: 18, blurType: 'gaussian', showBorder: true })
    );
    expect(latestController?.blurSettings).toEqual({
      amount: 18,
      blurType: 'gaussian',
      showBorder: true,
    });
  });

  it('cancels an open scan when highlighter mode is turned off', async () => {
    await expectModeCloseFlow();
  });

  it('auto-applies stored settings only when auto mode is allowed', async () => {
    await expectAutoApplyAllowedGate();
  });

  it('runs apply-once through the public controller and settles applying state', async () => {
    const scan = createDeferred<{ matches: AutoBlurMatch[] }>();
    controllerMocks.scanAutoBlurTargets.mockReturnValue(scan.promise);
    await renderHarness();

    let applyPromise: Promise<void> | undefined;
    await act(async () => {
      applyPromise = latestController?.applyOnce();
      await Promise.resolve();
    });
    expect(latestController?.isApplying).toBe(true);

    await act(async () => {
      scan.resolve({ matches: [createMatch()] });
      await applyPromise;
    });

    expect(latestController?.isApplying).toBe(false);
    expect(syncAutoBlurFrameCalls).toContainEqual({
      allowDeferredInitialPlacement: true,
      blurSettings: controllerMocks.defaultSettings.blurSettings,
      targets: [expect.objectContaining({ id: 'email-match' })],
    });
  });

  it('surfaces apply-once failure and settles applying state', async () => {
    const error = new Error('apply-once scan failed');
    controllerMocks.scanAutoBlurTargets.mockRejectedValue(error);
    await renderHarness();

    await act(async () => {
      await latestController?.applyOnce();
    });

    expect(latestController?.isApplying).toBe(false);
    expect(latestController?.errorMessage).toBe('content.autoBlur.applyError');
    expect(controllerMocks.logger.error).toHaveBeenCalledWith(
      'Failed to apply auto-blur once',
      error
    );
  });

  it('clears scanned targets through reset and surfaces clear failure', async () => {
    await renderHarness();
    await openAndFlushScan();

    act(() => latestController?.reset());
    expect(frameManager.clearAutoBlurFrames).toHaveBeenCalledWith({
      targets: expect.arrayContaining([
        expect.objectContaining({ id: 'email-match' }),
        expect.objectContaining({ id: 'phone-match' }),
        expect.objectContaining({ id: 'blurred-email-match' }),
      ]),
    });

    const error = new Error('clear failed');
    vi.mocked(frameManager.clearAutoBlurFrames).mockImplementation(() => {
      throw error;
    });
    act(() => latestController?.reset());

    expect(latestController?.errorMessage).toBe('content.autoBlur.applyError');
    expect(controllerMocks.logger.error).toHaveBeenCalledWith(
      'Failed to clear auto-blur frames',
      error
    );
  });

  it('toggles auto-apply through persistence before applying stored settings', async () => {
    const persistence = createDeferred<void>();
    controllerMocks.saveAutoBlurSettings.mockReturnValue(persistence.promise);
    await renderHarness();

    let togglePromise: Promise<void> | undefined;
    await act(async () => {
      togglePromise = latestController?.toggleAutoApply();
      await Promise.resolve();
    });
    expect(latestController?.isApplying).toBe(true);
    expect(syncAutoBlurFrameCalls).toHaveLength(0);

    await act(async () => {
      persistence.resolve(undefined);
      await togglePromise;
    });

    expect(controllerMocks.saveAutoBlurSettings).toHaveBeenCalledWith({
      ...controllerMocks.defaultSettings,
      autoApplyEnabled: true,
    });
    expect(latestController?.autoApplyEnabled).toBe(true);
    expect(latestController?.isApplying).toBe(false);
    expect(syncAutoBlurFrameCalls).toHaveLength(1);
  });

  it('keeps toggle disabled behind the allowed gate and settles persistence failure', async () => {
    await renderHarness(true, false);

    await act(async () => {
      await latestController?.toggleAutoApply();
    });
    expect(controllerMocks.saveAutoBlurSettings).not.toHaveBeenCalled();
    expect(latestController?.autoApplyEnabled).toBe(false);
    expect(latestController?.isApplying).toBe(false);

    const error = new Error('toggle persistence failed');
    controllerMocks.saveAutoBlurSettings.mockRejectedValue(error);
    await renderHarness(true, true);
    await act(async () => {
      await latestController?.toggleAutoApply();
    });

    expect(latestController?.errorMessage).toBe('content.autoBlur.applyError');
    expect(latestController?.isApplying).toBe(false);
    expect(controllerMocks.logger.error).toHaveBeenCalledWith(
      'Failed to toggle auto-blur mode',
      error
    );
  });

  it('keeps persistence, frame sync, and close ordering transactional', async () => {
    await expectPersistenceBeforeClose();
  });

  it('ignores a stale scan result after the session closes', async () => {
    await expectStaleScanIgnoredAfterClose();
  });

  it('surfaces scan failure without retaining stale matches', async () => {
    const error = new Error('scan failed');
    controllerMocks.scanAutoBlurTargets.mockRejectedValue(error);

    await renderHarness();
    await openAndFlushScan();

    expect(latestController?.status).toBe('error');
    expect(latestController?.matches).toEqual([]);
    expect(controllerMocks.logger.error).toHaveBeenCalledWith(
      'Failed to scan auto-blur targets',
      error
    );
  });

  it('keeps the session open and settles applying state when persistence fails', async () => {
    const error = new Error('storage failed');
    controllerMocks.saveAutoBlurSettings.mockRejectedValue(error);
    await renderHarness();
    await openAndFlushScan();

    await act(async () => {
      await latestController?.apply();
    });

    expect(latestController?.isOpen).toBe(true);
    expect(latestController?.isApplying).toBe(false);
    expect(latestController?.errorMessage).toBe('content.autoBlur.applyError');
    expect(syncAutoBlurFrameCalls).toHaveLength(0);
    expect(controllerMocks.logger.error).toHaveBeenCalledWith(
      'Failed to apply auto-blur targets',
      error
    );
  });

  it('cancels scheduled auto-apply work when the controller unmounts', async () => {
    vi.useFakeTimers();
    controllerMocks.loadAutoBlurSettings.mockResolvedValue({
      ...controllerMocks.defaultSettings,
      autoApplyEnabled: true,
    });
    await renderHarness();
    await act(async () => {
      await Promise.resolve();
    });

    act(() => root?.unmount());
    root = null;
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(syncAutoBlurFrameCalls).toHaveLength(0);
  });
});
