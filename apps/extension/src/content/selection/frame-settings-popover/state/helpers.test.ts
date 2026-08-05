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
  const handler = createFrameSettingsPresetHandler({
    onApplyToFrame: vi.fn(),
    setSelectedPreset: vi.fn(),
  });

  handler(PRESET);

  expect(getFrameSessionBorderPreset()).toEqual(projectBorderPresetToAppliedSettings(PRESET));
  expect(getFrameSessionBorderPreset()).not.toBe(PRESET);
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
  });

  handlers.handleFocusChange(0.8);

  expect(focusListener).toHaveBeenCalledWith({
    settings: { ...localFocusSettings, opacity: 0.8 },
  });
  expect(opacityListener).not.toHaveBeenCalled();

  cleanupFocus();
  cleanupOpacity();
});
