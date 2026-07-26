// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  addFocusOpacityChangedListener,
  addSessionBlurSettingsChangedListener,
  addSessionFocusSettingsChangedListener,
  dispatchFocusOpacityChanged,
  dispatchSessionBlurSettingsChanged,
  dispatchSessionFocusSettingsChanged,
} from '.';

describe('frame-events session family', () => {
  it('dispatches and subscribes to shared session settings changes', expectSessionSettingsEvents);
});

function expectSessionSettingsEvents() {
  const blurListener = vi.fn();
  const focusListener = vi.fn();
  const opacityListener = vi.fn();
  const cleanupBlur = addSessionBlurSettingsChangedListener(blurListener);
  const cleanupFocus = addSessionFocusSettingsChangedListener(focusListener);
  const cleanupOpacity = addFocusOpacityChangedListener(opacityListener);

  dispatchSessionBlurSettingsChanged({
    settings: { amount: 12, blurType: 'gaussian', showBorder: true },
  });
  dispatchSessionFocusSettingsChanged({ settings: { opacity: 0.35, showBorder: true } });
  dispatchFocusOpacityChanged({ frameId: 'frame-1', opacity: 0.6 });

  expect(blurListener).toHaveBeenCalledWith({
    settings: { amount: 12, blurType: 'gaussian', showBorder: true },
  });
  expect(focusListener).toHaveBeenCalledWith({
    settings: { opacity: 0.35, showBorder: true },
  });
  expect(opacityListener).toHaveBeenCalledWith({ frameId: 'frame-1', opacity: 0.6 });

  cleanupBlur();
  cleanupFocus();
  cleanupOpacity();
}
