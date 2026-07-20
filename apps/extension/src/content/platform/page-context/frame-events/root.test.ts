// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { BlurSettings, FocusSettings } from '../../../../features/highlighter/contracts';
import type { CalloutSettings } from '../../../../features/highlighter/contracts';
import type { StepBadgeSettings } from '../../../../features/highlighter/contracts';
import {
  addCalloutBlurRequestListener,
  addCalloutDeleteListener,
  addCalloutPopoverSettingsChangedListener,
  addFocusOpacityChangedListener,
  addFrameCalloutChangedListener,
  addFrameStepBadgeChangedListener,
  addHighlighterSettingsChangedListener,
  addSessionBlurSettingsChangedListener,
  addSessionFocusSettingsChangedListener,
  addStepBadgeReorderListener,
  dispatchCalloutBlurRequest,
  dispatchCalloutDelete,
  dispatchCalloutPopoverSettingsChanged,
  dispatchFocusOpacityChanged,
  dispatchFrameCalloutChanged,
  dispatchFrameStepBadgeChanged,
  dispatchHighlighterSettingsChanged,
  dispatchSessionBlurSettingsChanged,
  dispatchSessionFocusSettingsChanged,
  dispatchStepBadgeReorder,
} from '.';

const BLUR_SETTINGS: BlurSettings = { amount: 12, blurType: 'gaussian', showBorder: true };
const FOCUS_SETTINGS: FocusSettings = { opacity: 0.35, showBorder: true };
const STEP_BADGE_SETTINGS: Partial<StepBadgeSettings> = { enabled: true, value: 'A' };
const CALLOUT_SETTINGS: Partial<CalloutSettings> = { enabled: true, variant: 'text-only' };

describe('content frame events for step badges', () => {
  it('dispatches and subscribes to frame-step-badge changes', () => {
    const listener = vi.fn();
    const cleanup = addFrameStepBadgeChangedListener(listener);

    dispatchFrameStepBadgeChanged({ frameId: 'frame-1', settings: STEP_BADGE_SETTINGS });

    expect(listener).toHaveBeenCalledWith({
      frameId: 'frame-1',
      settings: STEP_BADGE_SETTINGS,
    });

    cleanup();
  });

  it('dispatches and subscribes to step-badge reorder events', () => {
    const listener = vi.fn();
    const cleanup = addStepBadgeReorderListener(listener);

    dispatchStepBadgeReorder({ direction: 'down', frameId: 'frame-2' });

    expect(listener).toHaveBeenCalledWith({ direction: 'down', frameId: 'frame-2' });

    cleanup();
  });
});

describe('content frame events for callouts', () => {
  it('dispatches and subscribes to frame-callout changes and delete events', () => {
    const changeListener = vi.fn();
    const deleteListener = vi.fn();
    const cleanupChange = addFrameCalloutChangedListener(changeListener);
    const cleanupDelete = addCalloutDeleteListener(deleteListener);

    dispatchFrameCalloutChanged({ frameId: 'frame-3', settings: CALLOUT_SETTINGS });
    dispatchCalloutDelete({ frameId: 'frame-3' });

    expect(changeListener).toHaveBeenCalledWith({
      frameId: 'frame-3',
      settings: CALLOUT_SETTINGS,
    });
    expect(deleteListener).toHaveBeenCalledWith({ frameId: 'frame-3' });

    cleanupChange();
    cleanupDelete();
  });

  it('dispatches and subscribes to callout popover settings and blur requests', () => {
    const settingsListener = vi.fn();
    const blurListener = vi.fn();
    const cleanupSettings = addCalloutPopoverSettingsChangedListener(settingsListener);
    const cleanupBlur = addCalloutBlurRequestListener(blurListener);

    dispatchCalloutPopoverSettingsChanged({
      frameId: 'frame-4',
      settings: CALLOUT_SETTINGS,
    });
    dispatchCalloutBlurRequest({ frameId: 'frame-4' });

    expect(settingsListener).toHaveBeenCalledWith({
      frameId: 'frame-4',
      settings: CALLOUT_SETTINGS,
    });
    expect(blurListener).toHaveBeenCalledWith({ frameId: 'frame-4' });

    cleanupSettings();
    cleanupBlur();
  });
});

describe('content frame events for shared settings', () => {
  it('dispatches and subscribes to focus and blur session settings changes', () => {
    const blurListener = vi.fn();
    const focusListener = vi.fn();
    const opacityListener = vi.fn();
    const cleanupBlur = addSessionBlurSettingsChangedListener(blurListener);
    const cleanupFocus = addSessionFocusSettingsChangedListener(focusListener);
    const cleanupOpacity = addFocusOpacityChangedListener(opacityListener);

    dispatchSessionBlurSettingsChanged({ settings: BLUR_SETTINGS });
    dispatchSessionFocusSettingsChanged({ settings: FOCUS_SETTINGS });
    dispatchFocusOpacityChanged({ frameId: 'frame-5', opacity: 0.6 });

    expect(blurListener).toHaveBeenCalledWith({ settings: BLUR_SETTINGS });
    expect(focusListener).toHaveBeenCalledWith({ settings: FOCUS_SETTINGS });
    expect(opacityListener).toHaveBeenCalledWith({ frameId: 'frame-5', opacity: 0.6 });

    cleanupBlur();
    cleanupFocus();
    cleanupOpacity();
  });

  it('dispatches and subscribes to highlighter-settings changes', () => {
    const listener = vi.fn();
    const cleanup = addHighlighterSettingsChangedListener(listener);

    dispatchHighlighterSettingsChanged({ defaultBorderPresetId: 'preset-7' });

    expect(listener).toHaveBeenCalledWith({ defaultBorderPresetId: 'preset-7' });

    cleanup();
  });
});
