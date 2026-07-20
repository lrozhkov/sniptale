// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { BORDER_SHADOW_SOFT_INTENSITY } from '../../../../features/highlighter/style';
import type {
  BlurSettings,
  BorderPreset,
  FocusSettings,
} from '../../../../features/highlighter/contracts';
import {
  addFocusOpacityChangedListener,
  addHighlighterSettingsChangedListener,
  addSessionBlurSettingsChangedListener,
  addSessionFocusSettingsChangedListener,
} from '../../../platform/page-context/frame-events';
import {
  createFrameBlurHandlers,
  createFrameFocusHandlers,
  createFrameSettingsPresetHandler,
} from './helpers';

const PRESET: BorderPreset = {
  color: '#ff00ff',
  id: 'preset-1',
  name: 'Preset',
  opacity: 100,
  order: 1,
  padding: { bottom: 8, left: 8, right: 8, top: 8 },
  radius: 4,
  shadow: BORDER_SHADOW_SOFT_INTENSITY,
  style: 'solid',
  width: 2,
  customCss: '',
  fillColor: '#00000000',
  fillOpacity: 0,
  inheritCustomCss: false,
  strokeOpacity: 100,
};

it('dispatches the saved default preset id after saving a preset', async () => {
  const listener = vi.fn();
  const cleanup = addHighlighterSettingsChangedListener(listener);
  const handler = createFrameSettingsPresetHandler({
    onApplyToFrame: vi.fn(),
    setDefaultBorderPreset: vi.fn().mockResolvedValue(undefined),
    setSelectedPresetId: vi.fn(),
  });

  await handler(PRESET);

  expect(listener).toHaveBeenCalledWith({ defaultBorderPresetId: PRESET.id });

  cleanup();
});

it('does not dispatch highlighter-settings changes when saving the default preset fails', async () => {
  const listener = vi.fn();
  const cleanup = addHighlighterSettingsChangedListener(listener);
  const handler = createFrameSettingsPresetHandler({
    onApplyToFrame: vi.fn(),
    setDefaultBorderPreset: vi.fn().mockRejectedValue(new Error('write failed')),
    setSelectedPresetId: vi.fn(),
  });

  await handler(PRESET);

  expect(listener).not.toHaveBeenCalled();

  cleanup();
});

it('dispatches session blur settings changes through the shared event seam', () => {
  const listener = vi.fn();
  const cleanup = addSessionBlurSettingsChangedListener(listener);
  const localBlurSettings: BlurSettings = {
    amount: 4,
    blurType: 'gaussian',
    showBorder: false,
  };
  const handlers = createFrameBlurHandlers({
    blurDebounceRef: { current: null },
    localBlurSettings,
    onApplyToFrame: vi.fn(),
    setLocalBlurSettings: vi.fn(),
  });

  handlers.handleBlurChange(18);

  expect(listener).toHaveBeenCalledWith({
    settings: { ...localBlurSettings, amount: 18 },
  });

  cleanup();
});

it('dispatches session focus and opacity changes through the shared event seam', () => {
  const focusListener = vi.fn();
  const opacityListener = vi.fn();
  const cleanupFocus = addSessionFocusSettingsChangedListener(focusListener);
  const cleanupOpacity = addFocusOpacityChangedListener(opacityListener);
  const localFocusSettings: FocusSettings = { opacity: 0.4, showBorder: false };
  const handlers = createFrameFocusHandlers({
    focusDebounceRef: { current: null },
    frameId: 'frame-1',
    localFocusSettings,
    onApplyToFrame: vi.fn(),
    setLocalFocusSettings: vi.fn(),
  });

  handlers.handleFocusChange(0.75);

  expect(focusListener).toHaveBeenCalledWith({
    settings: { ...localFocusSettings, opacity: 0.75 },
  });
  expect(opacityListener).toHaveBeenCalledWith({ frameId: 'frame-1', opacity: 0.75 });

  cleanupFocus();
  cleanupOpacity();
});
