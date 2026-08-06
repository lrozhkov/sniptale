// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({
  scanAutoBlurTargets: vi.fn(),
}));

vi.mock('../../../selection/auto-blur-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/auto-blur-runtime')>()),
  scanAutoBlurTargets: runtimeMocks.scanAutoBlurTargets,
}));

import { applyAutoBlurWithSettings, type AutoBlurFrameManager } from './operations';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';

const BORDER_SETTINGS = projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET);

beforeEach(() => {
  vi.clearAllMocks();
  const element = document.createElement('span');
  document.body.replaceChildren(element);
  runtimeMocks.scanAutoBlurTargets.mockResolvedValue({
    matches: [
      {
        alreadyBlurred: false,
        category: 'email',
        confidence: 1,
        element,
        id: 'email:100:120',
        rect: { height: 18, width: 70, x: 100, y: 120 },
        value: 'person@example.com',
      },
    ],
  });
});

it('allows full-page matches to initialize after the viewport is restored', async () => {
  const frameManager = {
    clearAutoBlurFrames: vi.fn(),
    frames: [],
    syncAutoBlurFrames: vi.fn(() => ({ addedCount: 1, removedCount: 0, skippedCount: 0 })),
  } satisfies AutoBlurFrameManager;

  await applyAutoBlurWithSettings({
    borderSettings: BORDER_SETTINGS,
    blurSettings: { amount: 10, blurType: 'solid', showBorder: false },
    frameManager,
    frames: frameManager.frames,
    scanMode: 'full-page',
    selectedCategories: ['email'],
  });

  expect(frameManager.syncAutoBlurFrames).toHaveBeenCalledWith(
    expect.objectContaining({ allowDeferredInitialPlacement: true })
  );
});

it('keeps current-view matches on strict visible initialization', async () => {
  const frameManager = {
    clearAutoBlurFrames: vi.fn(),
    frames: [],
    syncAutoBlurFrames: vi.fn(() => ({ addedCount: 1, removedCount: 0, skippedCount: 0 })),
  } satisfies AutoBlurFrameManager;

  await applyAutoBlurWithSettings({
    borderSettings: BORDER_SETTINGS,
    blurSettings: { amount: 10, blurType: 'solid', showBorder: false },
    frameManager,
    frames: frameManager.frames,
    selectedCategories: ['email'],
  });

  expect(frameManager.syncAutoBlurFrames).toHaveBeenCalledWith({
    borderSettings: BORDER_SETTINGS,
    blurSettings: { amount: 10, blurType: 'solid', showBorder: false },
    targets: expect.any(Array),
  });
});
