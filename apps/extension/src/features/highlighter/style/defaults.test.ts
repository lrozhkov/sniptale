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
      'system-marker',
      'system-success',
      'system-attention',
      'system-review',
      'system-light-ui',
      'system-dark-ui',
    ]);
    expect(settings.defaultBorderPresetId).toBe('system-default');
    expect(settings.borderPresets).toEqual([
      expect.objectContaining({
        id: 'system-default',
        color: '#F97316',
        width: 3,
        style: 'solid',
        radius: 0,
        padding: { top: 3, right: 3, bottom: 3, left: 3 },
        fillColor: '#00000000',
        fillOpacity: 0,
        shadow: 0,
      }),
      expect.objectContaining({
        id: 'system-soft-highlight',
        color: '#2563EB',
        width: 3,
        style: 'solid',
        radius: 10,
        padding: { top: 6, right: 6, bottom: 6, left: 6 },
        fillColor: '#60A5FA',
        fillOpacity: 8,
        shadow: 30,
      }),
      expect.objectContaining({
        id: 'system-marker',
        color: '#A16207',
        width: 2,
        radius: 4,
        padding: { top: 3, right: 3, bottom: 3, left: 3 },
        fillColor: '#FACC15',
        fillOpacity: 18,
      }),
      expect.objectContaining({ id: 'system-success', color: '#16A34A', fillColor: '#22C55E' }),
      expect.objectContaining({
        id: 'system-attention',
        color: '#EF4444',
        width: 4,
        fillColor: '#EF4444',
        fillOpacity: 7,
        shadow: 30,
      }),
      expect.objectContaining({ id: 'system-review', color: '#8B5CF6', style: 'dashed' }),
      expect.objectContaining({ id: 'system-light-ui', color: '#111827', width: 2 }),
      expect.objectContaining({ id: 'system-dark-ui', color: '#F8FAFC', width: 2, shadow: 30 }),
    ]);
    expect(settings.borderPresets.every((preset) => preset.customCss === '')).toBe(true);
    expect(settings.borderPresets.every((preset) => preset.inheritCustomCss === false)).toBe(true);
    expect(settings.borderPresets.every((preset) => preset.enabled !== false)).toBe(true);
    expect(DEFAULT_HIGHLIGHTER_SETTINGS.borderPresets).toHaveLength(8);
  });

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
    expect(settings.systemPresetCatalogRevision).toBeGreaterThan(0);
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
