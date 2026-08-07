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
  addSessionBlurSettingsChangedListener,
  addSessionFocusSettingsChangedListener,
} from '../../../platform/page-context/frame-events';
import {
  getFrameSessionBorderPreset,
  setFrameSessionBorderPreset,
} from '../../frame-runtime/session/border-preset';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import {
  createFrameBlurHandlers,
  createFrameFocusHandlers,
  createFrameSettingsPresetHandler,
} from './helpers';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';

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

it('keeps the selected preset in the current tab without saving the global default', () => {
  setFrameSessionBorderPreset(DEFAULT_BORDER_PRESET);
  const setLocalBlurSettings = vi.fn();
  const setLocalFocusSettings = vi.fn();
  const onApplyToFrame = vi.fn();
  const handler = createFrameSettingsPresetHandler({
    setLocalBlurSettings,
    setLocalFocusSettings,
    localBlurSettings: { amount: 3, blurType: 'pixelate', showBorder: false },
    localFocusSettings: { opacity: 0.2, showBorder: false },
    onApplyToFrame,
    setSelectedPreset: vi.fn(),
    syncSessionDefaults: true,
  });

  handler(PRESET);

  expect(getFrameSessionBorderPreset()).toEqual(projectBorderPresetToAppliedSettings(PRESET));
  expect(getFrameSessionBorderPreset()).not.toBe(PRESET);
  const expectedBlurSettings = {
    amount: 10,
    blurType: 'gaussian',
    showBorder: true,
  };
  const expectedFocusSettings = { blurAmount: 0, opacity: 0.5, showBorder: true };
  expect(setLocalBlurSettings).toHaveBeenCalledWith(expectedBlurSettings);
  expect(setLocalFocusSettings).toHaveBeenCalledWith(expectedFocusSettings);
  expect(onApplyToFrame).toHaveBeenCalledTimes(1);
  expect(onApplyToFrame).toHaveBeenCalledWith({
    borderSettings: projectBorderPresetToAppliedSettings(PRESET),
    blurSettings: expectedBlurSettings,
    focusSettings: expectedFocusSettings,
  });
});

it('keeps existing-frame border and effect changes out of future-frame defaults', () => {
  setFrameSessionBorderPreset(DEFAULT_BORDER_PRESET);
  const blurListener = vi.fn();
  const focusListener = vi.fn();
  const cleanupBlur = addSessionBlurSettingsChangedListener(blurListener);
  const cleanupFocus = addSessionFocusSettingsChangedListener(focusListener);
  const localBlurSettings: BlurSettings = {
    amount: 4,
    blurType: 'gaussian',
    showBorder: false,
  };
  const localFocusSettings: FocusSettings = { opacity: 0.4, showBorder: false };

  createFrameSettingsPresetHandler({
    localBlurSettings,
    localFocusSettings,
    onApplyToFrame: vi.fn(),
    setLocalBlurSettings: vi.fn(),
    setLocalFocusSettings: vi.fn(),
    setSelectedPreset: vi.fn(),
    syncSessionDefaults: false,
  })(PRESET);
  createFrameBlurHandlers({
    localBlurSettings,
    onApplyToFrame: vi.fn(),
    setLocalBlurSettings: vi.fn(),
    syncSessionDefaults: false,
  }).handleBlurChange(18);
  createFrameFocusHandlers({
    frameId: 'frame-1',
    localFocusSettings,
    onApplyToFrame: vi.fn(),
    setLocalFocusSettings: vi.fn(),
    syncSessionDefaults: false,
  }).handleFocusChange(0.75);

  expect(getFrameSessionBorderPreset()).toEqual(
    projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET)
  );
  expect(blurListener).not.toHaveBeenCalled();
  expect(focusListener).not.toHaveBeenCalled();

  cleanupBlur();
  cleanupFocus();
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
    localBlurSettings,
    onApplyToFrame: vi.fn(),
    setLocalBlurSettings: vi.fn(),
    syncSessionDefaults: true,
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
    frameId: 'frame-1',
    localFocusSettings,
    onApplyToFrame: vi.fn(),
    setLocalFocusSettings: vi.fn(),
    syncSessionDefaults: true,
  });

  handlers.handleFocusChange(0.75);

  expect(focusListener).toHaveBeenCalledWith({
    settings: { ...localFocusSettings, opacity: 0.75 },
  });
  expect(opacityListener).toHaveBeenCalledWith({ frameId: 'frame-1', opacity: 0.75 });

  cleanupFocus();
  cleanupOpacity();
});

it('updates only future focus settings when no existing frame owns the change', () => {
  const focusListener = vi.fn();
  const opacityListener = vi.fn();
  const cleanupFocus = addSessionFocusSettingsChangedListener(focusListener);
  const cleanupOpacity = addFocusOpacityChangedListener(opacityListener);
  const localFocusSettings: FocusSettings = { opacity: 0.4, showBorder: false };
  const handlers = createFrameFocusHandlers({
    localFocusSettings,
    onApplyToFrame: vi.fn(),
    setLocalFocusSettings: vi.fn(),
    syncSessionDefaults: true,
  });

  handlers.handleFocusChange(0.8);

  expect(focusListener).toHaveBeenCalledWith({
    settings: { ...localFocusSettings, opacity: 0.8 },
  });
  expect(opacityListener).not.toHaveBeenCalled();

  cleanupFocus();
  cleanupOpacity();
});

it('applies focus blur through the shared focus-settings seam without an opacity event', () => {
  const focusListener = vi.fn();
  const opacityListener = vi.fn();
  const cleanupFocus = addSessionFocusSettingsChangedListener(focusListener);
  const cleanupOpacity = addFocusOpacityChangedListener(opacityListener);
  const localFocusSettings: FocusSettings = { blurAmount: 0, opacity: 0.4, showBorder: false };
  const onApplyToFrame = vi.fn();
  const handlers = createFrameFocusHandlers({
    frameId: 'frame-1',
    localFocusSettings,
    onApplyToFrame,
    setLocalFocusSettings: vi.fn(),
    syncSessionDefaults: true,
  });

  handlers.handleFocusBlurChange(11);

  const expected = { ...localFocusSettings, blurAmount: 11 };
  expect(onApplyToFrame).toHaveBeenCalledWith({ focusSettings: expected });
  expect(focusListener).toHaveBeenCalledWith({ settings: expected });
  expect(opacityListener).not.toHaveBeenCalled();

  cleanupFocus();
  cleanupOpacity();
});
