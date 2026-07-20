// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type {
  BlurSettings,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';

const listenerMocks = vi.hoisted(() => ({
  addCalloutDeleteListener: vi.fn(),
  addCalloutPopoverSettingsChangedListener: vi.fn(),
  addFocusOpacityChangedListener: vi.fn(),
  addFrameCalloutChangedListener: vi.fn(),
  addFrameStepBadgeChangedListener: vi.fn(),
  addHighlighterSettingsChangedListener: vi.fn(),
  addSessionBlurSettingsChangedListener: vi.fn(),
  addSessionFocusSettingsChangedListener: vi.fn(),
  addStepBadgeReorderListener: vi.fn(),
}));

vi.mock('../../../platform/page-context/frame-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/page-context/frame-events')>()),
  addCalloutDeleteListener: listenerMocks.addCalloutDeleteListener,
  addCalloutPopoverSettingsChangedListener: listenerMocks.addCalloutPopoverSettingsChangedListener,
  addFocusOpacityChangedListener: listenerMocks.addFocusOpacityChangedListener,
  addFrameCalloutChangedListener: listenerMocks.addFrameCalloutChangedListener,
  addFrameStepBadgeChangedListener: listenerMocks.addFrameStepBadgeChangedListener,
  addHighlighterSettingsChangedListener: listenerMocks.addHighlighterSettingsChangedListener,
  addSessionBlurSettingsChangedListener: listenerMocks.addSessionBlurSettingsChangedListener,
  addSessionFocusSettingsChangedListener: listenerMocks.addSessionFocusSettingsChangedListener,
  addStepBadgeReorderListener: listenerMocks.addStepBadgeReorderListener,
}));

import {
  createFrameSessionListenerCleanups,
  registerLegacyGlobalStepBadgeSettingsListener,
} from './listeners';

function stubListenerRegistrations() {
  const cleanups = Array.from({ length: 9 }, () => vi.fn());
  const registrars = [
    listenerMocks.addHighlighterSettingsChangedListener,
    listenerMocks.addFocusOpacityChangedListener,
    listenerMocks.addSessionBlurSettingsChangedListener,
    listenerMocks.addSessionFocusSettingsChangedListener,
    listenerMocks.addFrameStepBadgeChangedListener,
    listenerMocks.addStepBadgeReorderListener,
    listenerMocks.addFrameCalloutChangedListener,
    listenerMocks.addCalloutPopoverSettingsChangedListener,
    listenerMocks.addCalloutDeleteListener,
  ];

  registrars.forEach((mock, index) => {
    mock.mockReset();
    mock.mockReturnValue(cleanups[index]);
  });

  return cleanups;
}

function createSessionRefs() {
  const blur: BlurSettings = { amount: 8, blurType: 'gaussian', showBorder: true };
  const focus: FocusSettings = { opacity: 0.5, showBorder: false };
  const highlighterSettings = createHighlighterSettingsFixture(blur, focus);

  return {
    highlighterSettingsCacheRef: { current: highlighterSettings },
    sessionBlurSettingsRef: { current: blur },
    sessionFocusSettingsRef: { current: focus },
  };
}

function createHighlighterSettingsFixture(
  blur: BlurSettings,
  focus: FocusSettings
): HighlighterSettings {
  return {
    borderPresets: [
      {
        color: '#ff00ff',
        customCss: '',
        fillColor: '#00000000',
        fillOpacity: 0,
        id: 'preset-1',
        inheritCustomCss: false,
        name: 'Preset 1',
        opacity: 100,
        order: 0,
        padding: { bottom: 8, left: 8, right: 8, top: 8 },
        radius: 4,
        shadow: 30,
        strokeOpacity: 100,
        style: 'solid',
        width: 2,
      },
      {
        color: '#22c55e',
        customCss: '',
        fillColor: '#00000000',
        fillOpacity: 0,
        id: 'preset-2',
        inheritCustomCss: false,
        name: 'Preset 2',
        opacity: 100,
        order: 1,
        padding: { bottom: 8, left: 8, right: 8, top: 8 },
        radius: 4,
        shadow: 30,
        strokeOpacity: 100,
        style: 'solid',
        width: 2,
      },
    ],
    defaultBlurSettings: blur,
    defaultBorderPresetId: 'preset-1',
    defaultEffectMode: 'border',
    defaultFocusSettings: focus,
  };
}

describe('frame-session-sync-listeners', () => {
  it(
    'assembles cleanup handlers and forwards registered listener events',
    expectCleanupAssemblyAndForwarding
  );

  it('forwards the legacy global step-badge event and unregisters on cleanup', () => {
    const listener = vi.fn();
    const cleanup = registerLegacyGlobalStepBadgeSettingsListener(listener);

    window.dispatchEvent(
      new CustomEvent('sniptale-global-step-badge-settings-changed', {
        detail: { settings: { autoMode: true } },
      })
    );
    cleanup();
    window.dispatchEvent(
      new CustomEvent('sniptale-global-step-badge-settings-changed', {
        detail: { settings: { autoMode: false } },
      })
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ autoMode: true });
  });
});

function expectCleanupAssemblyAndForwarding() {
  const cleanups = stubListenerRegistrations();
  const loadSettings = vi.fn();
  const syncFocusOpacity = vi.fn();
  const refs = createSessionRefs();

  const listeners = createFrameSessionListenerCleanups({
    frameCalloutHandlers: createFrameCalloutHandlers(),
    frameStepBadgeHandlers: createFrameStepBadgeHandlers(),
    highlighterSettingsCacheRef: refs.highlighterSettingsCacheRef,
    loadSettings,
    sessionBlurSettingsRef: refs.sessionBlurSettingsRef,
    sessionFocusSettingsRef: refs.sessionFocusSettingsRef,
    syncFocusOpacity,
  });

  expectCleanupList(cleanups, listeners);
  triggerRegisteredListeners();
  expectForwardedListenerEffects(loadSettings, syncFocusOpacity, refs);
}

function createFrameCalloutHandlers() {
  return {
    handleCalloutDelete: vi.fn(),
    handleCalloutPopoverSettingsChanged: vi.fn(),
    handleFrameCalloutChanged: vi.fn(),
  };
}

function createFrameStepBadgeHandlers() {
  return {
    handleFrameStepBadgeChanged: vi.fn(),
    handleGlobalStepBadgeSettingsChanged: vi.fn(),
    handleStepBadgeReorder: vi.fn(),
  };
}

function expectCleanupList(
  cleanups: ReturnType<typeof stubListenerRegistrations>,
  listeners: Array<() => void>
) {
  expect(listeners).toHaveLength(10);
  expect(listeners.slice(0, 4)).toEqual(cleanups.slice(0, 4));
  expect(listeners.slice(5)).toEqual(cleanups.slice(4));
}

function triggerRegisteredListeners() {
  const highlighterSettingsListener =
    listenerMocks.addHighlighterSettingsChangedListener.mock.calls[0]?.[0];
  const focusOpacityListener = listenerMocks.addFocusOpacityChangedListener.mock.calls[0]?.[0];
  const blurSettingsListener =
    listenerMocks.addSessionBlurSettingsChangedListener.mock.calls[0]?.[0];
  const focusSettingsListener =
    listenerMocks.addSessionFocusSettingsChangedListener.mock.calls[0]?.[0];
  if (
    !highlighterSettingsListener ||
    !focusOpacityListener ||
    !blurSettingsListener ||
    !focusSettingsListener
  ) {
    throw new Error('expected registered frame-session listeners');
  }

  highlighterSettingsListener({ defaultBorderPresetId: 'preset-2' });
  focusOpacityListener({
    frameId: 'frame-1',
    opacity: 0.75,
  });
  blurSettingsListener({
    settings: { amount: 12, blurType: 'pixelate', showBorder: false },
  });
  focusSettingsListener({
    settings: { opacity: 0.2, showBorder: true },
  });
}

function expectForwardedListenerEffects(
  loadSettings: ReturnType<typeof vi.fn>,
  syncFocusOpacity: ReturnType<typeof vi.fn>,
  refs: ReturnType<typeof createSessionRefs>
) {
  expect(loadSettings).not.toHaveBeenCalled();
  expect(syncFocusOpacity).toHaveBeenCalledWith('frame-1', 0.75);
  expect(refs.highlighterSettingsCacheRef.current?.defaultBorderPresetId).toBe('preset-2');
  expect(refs.sessionBlurSettingsRef.current).toEqual({
    amount: 12,
    blurType: 'pixelate',
    showBorder: false,
  });
  expect(refs.sessionFocusSettingsRef.current).toEqual({
    opacity: 0.2,
    showBorder: true,
  });
}

it('reloads settings when the changed default preset is not available in the cached settings', () => {
  const cleanups = stubListenerRegistrations();
  const refs = createSessionRefs();
  const loadSettings = vi.fn();
  const listeners = createFrameSessionListenerCleanups({
    frameCalloutHandlers: createFrameCalloutHandlers(),
    frameStepBadgeHandlers: createFrameStepBadgeHandlers(),
    highlighterSettingsCacheRef: refs.highlighterSettingsCacheRef,
    loadSettings,
    sessionBlurSettingsRef: refs.sessionBlurSettingsRef,
    sessionFocusSettingsRef: refs.sessionFocusSettingsRef,
    syncFocusOpacity: vi.fn(),
  });
  const highlighterSettingsListener =
    listenerMocks.addHighlighterSettingsChangedListener.mock.calls[0]?.[0];

  highlighterSettingsListener?.({ defaultBorderPresetId: 'missing-preset' });

  expect(cleanups).toHaveLength(9);
  expect(loadSettings).toHaveBeenCalledTimes(1);
  expect(refs.highlighterSettingsCacheRef.current?.defaultBorderPresetId).toBe('preset-1');
  listeners.forEach((cleanup) => cleanup());
});
