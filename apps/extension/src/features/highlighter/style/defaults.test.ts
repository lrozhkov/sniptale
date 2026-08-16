import { describe, expect, it } from 'vitest';

import {
  createDefaultHighlighterSettings,
  DEFAULT_BORDER_PRESET,
  DEFAULT_HIGHLIGHTER_SETTINGS,
} from './defaults';
import {
  createPreset,
  createSettings,
  createStoredSettings,
} from '../../../composition/persistence/highlighter/test-helpers';

describe('highlighter storage defaults', () => {
  it('ships the complete canonical system catalog in exact order', () => {
    const settings = createDefaultHighlighterSettings();

    expect(settings.borderPresets.map((preset) => preset.id)).toEqual([
      'system-default',
      'system-soft-highlight',
      'system-sunrise',
      'system-marker',
      'system-success',
      'system-sticky-note',
      'system-attention',
      'system-review',
      'system-dark-ui',
      'system-light-ui',
      'system-editorial-ink',
      'system-editorial-proof',
      'system-retro-sunset',
      'system-retro-arcade',
      'system-retro-memphis',
    ]);
    expect(settings.defaultBorderPresetId).toBe('system-default');
    expect(
      new Set(
        settings.borderPresets.map(
          (preset) =>
            `${preset.effects?.linkedTemplates?.calloutPresetId}:${preset.effects?.linkedTemplates?.stepBadgePresetId}`
        )
      ).size
    ).toBe(15);
    expect(settings.borderPresets.every((preset) => preset.customCss === '')).toBe(true);
    expect(settings.borderPresets.every((preset) => preset.inheritCustomCss === false)).toBe(true);
    expect(settings.borderPresets.every((preset) => preset.enabled !== false)).toBe(true);
    expect(DEFAULT_HIGHLIGHTER_SETTINGS.borderPresets).toHaveLength(15);
  });

  it('keeps expanded visual fields in default and test-helper presets', () => {
    const settings = createDefaultHighlighterSettings();
    const helperPreset = createPreset('preset');
    const helperOverridePreset = createPreset('override', {
      fillPaint: { kind: 'solid' as const, color: '#ff00006b' },
    });
    const helperSettings = createSettings({ defaultBorderPresetId: 'override' });
    const storedSettings = createStoredSettings();

    expect(DEFAULT_BORDER_PRESET).toMatchObject({
      fillPaint: { kind: 'solid' as const },
      inheritCustomCss: false,
      shadow: 8,
    });
    expect(settings.borderPresets[0]).toMatchObject({
      fillPaint: { kind: 'solid' as const },
      shadow: 8,
    });
    expect(settings.systemPresetCatalogRevision).toBeGreaterThan(0);
    expect(settings.defaultBlurSettings).toMatchObject({
      showBorder: true,
      strokeWidth: 0,
    });
    expect(settings.borderPresets.every((preset) => preset.effects != null)).toBe(true);
    expect(helperPreset).toMatchObject({
      inheritCustomCss: false,
      shadow: 0,
    });
    expect(helperOverridePreset.fillPaint).toEqual({ kind: 'solid', color: '#ff00006b' });
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
      padding: { top: 4, left: 4, right: 4, bottom: 4 },
      shadow: 8,
    });
    expect(secondSettings.defaultBlurSettings.amount).toBe(10);
    expect(secondSettings.defaultBlurSettings.strokeWidth).toBe(0);
    expect(secondSettings.defaultFocusSettings.opacity).toBe(0.5);
  });
});
