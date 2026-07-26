// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { BlurSettings, FocusSettings } from '../../../../features/highlighter/contracts';

const listenerMocks = vi.hoisted(() => ({
  addCalloutDeleteListener: vi.fn(),
  addCalloutPopoverSettingsChangedListener: vi.fn(),
  addFocusOpacityChangedListener: vi.fn(),
  addFrameCalloutChangedListener: vi.fn(),
  addFrameStepBadgeChangedListener: vi.fn(),
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
  addSessionBlurSettingsChangedListener: listenerMocks.addSessionBlurSettingsChangedListener,
  addSessionFocusSettingsChangedListener: listenerMocks.addSessionFocusSettingsChangedListener,
  addStepBadgeReorderListener: listenerMocks.addStepBadgeReorderListener,
}));

import {
  createFrameSessionListenerCleanups,
  registerLegacyGlobalStepBadgeSettingsListener,
} from './listeners';

function stubListenerRegistrations() {
  const cleanups = Array.from({ length: 8 }, () => vi.fn());
  const registrars = [
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

  return {
    sessionBlurSettingsRef: { current: blur },
    sessionDefaultsInitializedRef: { current: false },
    sessionFocusSettingsRef: { current: focus },
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
  const syncFocusOpacity = vi.fn();
  const refs = createSessionRefs();

  const listeners = createFrameSessionListenerCleanups({
    frameCalloutHandlers: createFrameCalloutHandlers(),
    frameStepBadgeHandlers: createFrameStepBadgeHandlers(),
    sessionBlurSettingsRef: refs.sessionBlurSettingsRef,
    sessionDefaultsInitializedRef: refs.sessionDefaultsInitializedRef,
    sessionFocusSettingsRef: refs.sessionFocusSettingsRef,
    syncFocusOpacity,
  });

  expectCleanupList(cleanups, listeners);
  triggerRegisteredListeners();
  expectForwardedListenerEffects(syncFocusOpacity, refs);
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
  expect(listeners).toHaveLength(9);
  expect(listeners.slice(0, 3)).toEqual(cleanups.slice(0, 3));
  expect(listeners.slice(4)).toEqual(cleanups.slice(3));
}

function triggerRegisteredListeners() {
  const focusOpacityListener = listenerMocks.addFocusOpacityChangedListener.mock.calls[0]?.[0];
  const blurSettingsListener =
    listenerMocks.addSessionBlurSettingsChangedListener.mock.calls[0]?.[0];
  const focusSettingsListener =
    listenerMocks.addSessionFocusSettingsChangedListener.mock.calls[0]?.[0];
  if (!focusOpacityListener || !blurSettingsListener || !focusSettingsListener) {
    throw new Error('expected registered frame-session listeners');
  }

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
  syncFocusOpacity: ReturnType<typeof vi.fn>,
  refs: ReturnType<typeof createSessionRefs>
) {
  expect(syncFocusOpacity).toHaveBeenCalledWith('frame-1', 0.75);
  expect(refs.sessionBlurSettingsRef.current).toEqual({
    amount: 12,
    blurType: 'pixelate',
    showBorder: false,
  });
  expect(refs.sessionFocusSettingsRef.current).toEqual({
    opacity: 0.2,
    showBorder: true,
  });
  expect(refs.sessionDefaultsInitializedRef.current).toBe(true);
}
