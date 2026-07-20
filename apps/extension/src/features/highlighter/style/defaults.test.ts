import { describe, expect, it } from 'vitest';

import { createDefaultHighlighterSettings, DEFAULT_BORDER_PRESET } from './defaults';
import {
  createPreset,
  createSettings,
  createStoredSettings,
} from '../../../composition/persistence/highlighter/test-helpers';

describe('highlighter storage defaults', () => {
  it('keeps expanded visual fields in default and test-helper presets', () => {
    const settings = createDefaultHighlighterSettings();
    const helperPreset = createPreset('preset');
    const helperOverridePreset = createPreset('override', { fillOpacity: 42 });
    const helperSettings = createSettings({ defaultBorderPresetId: 'override' });
    const storedSettings = createStoredSettings();

    expect(DEFAULT_BORDER_PRESET).toMatchObject({
      fillColor: '#00000000',
      fillOpacity: 0,
      inheritCustomCss: false,
      shadow: 0,
      strokeOpacity: 100,
    });
    expect(settings.borderPresets[0]).toMatchObject({
      fillColor: '#00000000',
      shadow: 0,
      strokeOpacity: 100,
    });
    expect(settings.defaultBlurSettings).toMatchObject({
      showBorder: false,
      strokeWidth: 0,
    });
    expect(helperPreset).toMatchObject({
      fillOpacity: 0,
      inheritCustomCss: false,
      shadow: 0,
    });
    expect(helperOverridePreset.fillOpacity).toBe(42);
    expect(helperSettings.defaultBorderPresetId).toBe('override');
    expect(storedSettings.sniptale_highlighter_settings.defaultBorderPresetId).toBe('preset-2');
  });
});

describe('highlighter storage default snapshots', () => {
  it('returns detached default settings snapshots', () => {
    const firstSettings = createDefaultHighlighterSettings();
    const secondSettings = createDefaultHighlighterSettings();

    firstSettings.borderPresets[0]!.padding.top = 99;
    firstSettings.defaultBlurSettings.amount = 24;
    firstSettings.defaultFocusSettings.opacity = 0.9;

    expect(secondSettings.borderPresets[0]).toMatchObject({
      padding: { top: 3, left: 3, right: 3, bottom: 3 },
      shadow: 0,
    });
    expect(secondSettings.defaultBlurSettings.amount).toBe(10);
    expect(secondSettings.defaultBlurSettings.strokeWidth).toBe(0);
    expect(secondSettings.defaultFocusSettings.opacity).toBe(0.5);
  });
});
