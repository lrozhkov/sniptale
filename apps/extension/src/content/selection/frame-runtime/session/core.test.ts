// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FrameData, HighlighterSettings } from '../../../../features/highlighter/contracts';

const storageMocks = vi.hoisted(() => ({
  subscribeToChangesMock: vi.fn(() => vi.fn()),
}));

const settingsMocks = vi.hoisted(() => ({
  loadHighlighterSettingsMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    subscribeToChanges: storageMocks.subscribeToChangesMock,
  },
}));

vi.mock('../../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/highlighter')>()),

  loadHighlighterSettings: settingsMocks.loadHighlighterSettingsMock,
}));

import {
  dispatchCalloutDelete,
  dispatchCalloutPopoverSettingsChanged,
  dispatchFocusOpacityChanged,
  dispatchFrameCalloutChanged,
  dispatchFrameStepBadgeChanged,
  dispatchHighlighterSettingsChanged,
  dispatchSessionBlurSettingsChanged,
  dispatchSessionFocusSettingsChanged,
  dispatchStepBadgeReorder,
} from '../../../platform/page-context/frame-events';
import { setupFrameSessionSyncListeners } from './core';

const DEFAULT_SETTINGS: HighlighterSettings = {
  borderPresets: [
    {
      color: '#ff00ff',
      customCss: '',
      fillColor: '#00000000',
      fillOpacity: 0,
      inheritCustomCss: false,
      strokeOpacity: 100,
      id: 'preset-1',
      name: 'Preset',
      opacity: 100,
      order: 1,
      padding: { bottom: 8, left: 8, right: 8, top: 8 },
      radius: 4,
      shadow: 30,
      style: 'solid',
      width: 2,
    },
  ],
  defaultBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
  defaultBorderPresetId: 'preset-1',
  defaultEffectMode: 'border',
  defaultFocusSettings: { opacity: 0.5, showBorder: false },
};

function createFramesStore() {
  let frames: FrameData[] = [
    {
      height: 120,
      id: 'frame-1',
      width: 200,
      x: 10,
      y: 20,
      callout: {
        anchor: 'top-left',
        bgColor: '#111111',
        enabled: true,
        fontFamily: 'sans',
        fontSize: 14,
        fontWeight: 'normal',
        htmlContent: 'old',
        maxWidth: 240,
        side: 'top',
        tailSize: 12,
        textColor: '#ffffff',
        variant: 'bubble',
      },
      stepBadge: { enabled: true, value: '1' },
    } as FrameData,
  ];

  return {
    getFrames: () => frames,
    setFrames: (update: React.SetStateAction<FrameData[]>) => {
      frames = typeof update === 'function' ? update(frames) : update;
      return frames;
    },
  };
}

function dispatchFrameSessionEvents() {
  dispatchFrameStepBadgeChanged({
    frameId: 'frame-1',
    settings: { value: '2' },
  });
  dispatchStepBadgeReorder({ direction: 'down', frameId: 'frame-1' });
  dispatchFrameCalloutChanged({
    frameId: 'frame-1',
    settings: { htmlContent: 'next' },
  });
  dispatchCalloutPopoverSettingsChanged({
    frameId: 'frame-1',
    settings: { variant: 'text-only' },
  });
  dispatchCalloutDelete({ frameId: 'frame-1' });
  dispatchFocusOpacityChanged({ frameId: 'frame-1', opacity: 0.7 });
  dispatchSessionBlurSettingsChanged({
    settings: { amount: 12, blurType: 'gaussian', showBorder: false },
  });
  dispatchSessionFocusSettingsChanged({
    settings: { opacity: 0.25, showBorder: true },
  });
  dispatchHighlighterSettingsChanged();
}

beforeEach(() => {
  settingsMocks.loadHighlighterSettingsMock.mockReset();
  storageMocks.subscribeToChangesMock.mockClear();
  settingsMocks.loadHighlighterSettingsMock.mockResolvedValue(DEFAULT_SETTINGS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('syncs frame and callout events through the shared frame-event seam', async () => {
  const framesStore = createFramesStore();
  const syncFocusOpacity = vi.fn();
  const updateFrameStepBadge = vi.fn();
  const reorderStepBadge = vi.fn();
  const cleanup = setupFrameSessionSyncListeners({
    globalEffectModeRef: { current: 'border' },
    highlighterSettingsCacheRef: { current: null },
    reorderStepBadge,
    sessionBlurSettingsRef: { current: DEFAULT_SETTINGS.defaultBlurSettings },
    sessionCalloutStyleRef: { current: null },
    sessionFocusSettingsRef: { current: DEFAULT_SETTINGS.defaultFocusSettings },
    setFrames: framesStore.setFrames,
    syncFocusOpacity,
    updateFrameStepBadge,
    updateGlobalStepBadgeSettings: vi.fn(),
    withHistoryCommit: <T extends (...args: never[]) => unknown>(action: T) => action,
  });

  await Promise.resolve();
  dispatchFrameSessionEvents();

  expect(updateFrameStepBadge).toHaveBeenCalledWith('frame-1', { value: '2' });
  expect(reorderStepBadge).toHaveBeenCalledWith('frame-1', 'down');
  expect(syncFocusOpacity).toHaveBeenCalledWith('frame-1', 0.7);
  expect(framesStore.getFrames()[0]?.callout).toEqual({
    anchor: 'top-left',
    bgColor: '#111111',
    enabled: false,
    fontFamily: 'sans',
    fontSize: 14,
    fontWeight: 'normal',
    htmlContent: 'next',
    maxWidth: 240,
    side: 'top',
    tailSize: 12,
    textColor: '#ffffff',
    variant: 'text-only',
  });

  cleanup();
});

it('wraps only discrete non-step-badge session handlers with history commits', async () => {
  const framesStore = createFramesStore();
  const withHistoryCommit = vi.fn(
    (<T extends (...args: never[]) => unknown>(action: T): T => action) as <
      T extends (...args: never[]) => unknown,
    >(
      action: T
    ) => T
  );
  const cleanup = setupFrameSessionSyncListeners({
    globalEffectModeRef: { current: 'border' },
    highlighterSettingsCacheRef: { current: null },
    reorderStepBadge: vi.fn(),
    sessionBlurSettingsRef: { current: DEFAULT_SETTINGS.defaultBlurSettings },
    sessionCalloutStyleRef: { current: null },
    sessionFocusSettingsRef: { current: DEFAULT_SETTINGS.defaultFocusSettings },
    setFrames: framesStore.setFrames,
    syncFocusOpacity: vi.fn(),
    updateFrameStepBadge: vi.fn(),
    updateGlobalStepBadgeSettings: vi.fn(),
    withHistoryCommit: withHistoryCommit as Parameters<
      typeof setupFrameSessionSyncListeners
    >[0]['withHistoryCommit'],
  });

  await Promise.resolve();

  expect(withHistoryCommit).toHaveBeenCalledTimes(4);

  cleanup();
});
