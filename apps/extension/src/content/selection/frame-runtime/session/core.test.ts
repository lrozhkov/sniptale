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
    canObserveChanges: () => false,
    subscribeToChanges: storageMocks.subscribeToChangesMock,
    sync: { get: vi.fn(async () => ({})) },
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
  dispatchSessionBlurSettingsChanged,
  dispatchSessionFocusSettingsChanged,
  dispatchStepBadgeReorder,
} from '../../../platform/page-context/frame-events';
import { setupFrameSessionSyncListeners } from './core';
import { createDefaultCalloutSettings } from '../../../../features/highlighter/frame-annotation/callout/model';

const DEFAULT_SETTINGS: HighlighterSettings = {
  borderPresets: [
    {
      color: '#ff00ff',
      customCss: '',
      fillColor: '#00000000',
      inheritCustomCss: false,
      id: 'preset-1',
      name: 'Preset',
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
  systemPresetCatalogRevision: 1,
  defaultFocusSettings: { opacity: 0.5, showBorder: false },
};

function createFramesStore() {
  const callout = createDefaultCalloutSettings();
  callout.content.bodyHtml = 'old';
  callout.placement = { anchor: 'top-left', side: 'top' };
  callout.style.typography.maxWidth = 240;
  callout.style.connector.wedgeSize = 12;
  let frames: FrameData[] = [
    {
      height: 120,
      id: 'frame-1',
      width: 200,
      x: 10,
      y: 20,
      callout,
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
    settings: { content: { bodyHtml: 'next' } },
  });
  dispatchCalloutPopoverSettingsChanged({
    frameId: 'frame-1',
    settings: { style: { surface: { backgroundColor: 'transparent' } } },
  });
  dispatchCalloutDelete({ frameId: 'frame-1' });
  dispatchFocusOpacityChanged({ frameId: 'frame-1', opacity: 0.7 });
  dispatchSessionBlurSettingsChanged({
    settings: { amount: 12, blurType: 'gaussian', showBorder: false },
  });
  dispatchSessionFocusSettingsChanged({
    settings: { opacity: 0.25, showBorder: true },
  });
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
    sessionDefaultsInitializedRef: { current: false },
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
  expect(framesStore.getFrames()[0]?.callout).toMatchObject({
    content: { bodyHtml: 'next' },
    enabled: false,
    placement: { anchor: 'top-left', side: 'top' },
    style: { surface: { backgroundColor: 'transparent' } },
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
    sessionDefaultsInitializedRef: { current: false },
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
