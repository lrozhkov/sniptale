// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_BLUR_CATEGORIES,
  type AutoBlurSettings,
} from '../../../../features/highlighter/contracts/auto-blur';
import type { AutoBlurMatch } from '../../../selection/auto-blur-runtime';
import type { FrameManager } from './types';

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
let frameManager: FrameManager;
let syncAutoBlurFrameCalls: unknown[];

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
    addFrame: vi.fn(),
    addAutoBlurFrames: vi.fn(),
    clearFrames: vi.fn(),
    clearAutoBlurFrames: vi.fn(),
    frames: [],
    getGlobalStepBadgeSettings: vi.fn(),
    hasFrameForElement: vi.fn(),
    recalculateStepBadges: vi.fn(),
    removeFrame: vi.fn(),
    syncFocusOpacity: vi.fn(),
    syncAutoBlurFrames(input) {
      syncAutoBlurFrameCalls.push(input);
      return { addedCount: 0, removedCount: 0, skippedCount: 0 };
    },
    updateFrame: vi.fn(),
    updateFrameEffect: vi.fn(),
    updateFrameStepBadge: vi.fn(),
    updateGlobalStepBadgeSettings: vi.fn(),
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

  it('cancels an open scan when highlighter mode is turned off', async () => {
    await expectModeCloseFlow();
  });

  it('auto-applies stored settings only when auto mode is allowed', async () => {
    await expectAutoApplyAllowedGate();
  });
});
