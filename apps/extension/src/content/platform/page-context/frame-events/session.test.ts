// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  addFocusOpacityChangedListener,
  addHighlighterSettingsChangedListener,
  addSessionBlurSettingsChangedListener,
  addSessionFocusSettingsChangedListener,
  dispatchFocusOpacityChanged,
  dispatchHighlighterSettingsChanged,
  dispatchSessionBlurSettingsChanged,
  dispatchSessionFocusSettingsChanged,
} from '.';

describe('frame-events session family', () => {
  it('dispatches and subscribes to shared session settings changes', expectSessionSettingsEvents);

  it('ignores malformed highlighter settings event detail', expectMalformedHighlighterDetails);
});

function expectSessionSettingsEvents() {
  const blurListener = vi.fn();
  const focusListener = vi.fn();
  const opacityListener = vi.fn();
  const highlighterListener = vi.fn();
  const cleanupBlur = addSessionBlurSettingsChangedListener(blurListener);
  const cleanupFocus = addSessionFocusSettingsChangedListener(focusListener);
  const cleanupOpacity = addFocusOpacityChangedListener(opacityListener);
  const cleanupHighlighter = addHighlighterSettingsChangedListener(highlighterListener);

  dispatchSessionBlurSettingsChanged({
    settings: { amount: 12, blurType: 'gaussian', showBorder: true },
  });
  dispatchSessionFocusSettingsChanged({ settings: { opacity: 0.35, showBorder: true } });
  dispatchFocusOpacityChanged({ frameId: 'frame-1', opacity: 0.6 });
  dispatchHighlighterSettingsChanged({ defaultBorderPresetId: 'preset-2' });

  expect(blurListener).toHaveBeenCalledWith({
    settings: { amount: 12, blurType: 'gaussian', showBorder: true },
  });
  expect(focusListener).toHaveBeenCalledWith({
    settings: { opacity: 0.35, showBorder: true },
  });
  expect(opacityListener).toHaveBeenCalledWith({ frameId: 'frame-1', opacity: 0.6 });
  expect(highlighterListener).toHaveBeenCalledWith({ defaultBorderPresetId: 'preset-2' });

  cleanupBlur();
  cleanupFocus();
  cleanupOpacity();
  cleanupHighlighter();
}

function expectMalformedHighlighterDetails() {
  const target = new EventTarget();
  const highlighterListener = vi.fn();
  const cleanupHighlighter = addHighlighterSettingsChangedListener(highlighterListener, target);

  target.dispatchEvent(
    new CustomEvent('sniptale-highlighter-settings-changed', {
      detail: { defaultBorderPresetId: 123 },
    })
  );
  target.dispatchEvent(
    new CustomEvent('sniptale-highlighter-settings-changed', {
      detail: 'not-an-object',
    })
  );
  target.dispatchEvent(
    new CustomEvent('sniptale-highlighter-settings-changed', {
      detail: { unexpected: true },
    })
  );
  dispatchHighlighterSettingsChanged({ defaultBorderPresetId: 'preset-3' }, target);

  expect(highlighterListener).toHaveBeenCalledTimes(1);
  expect(highlighterListener).toHaveBeenCalledWith({ defaultBorderPresetId: 'preset-3' });

  cleanupHighlighter();
}
