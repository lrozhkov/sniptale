import { describe, expect, it } from 'vitest';
import { BORDER_SHADOW_SOFT_INTENSITY } from '../../highlighter/style/shadow';
import {
  projectBorderPresetToEditorShapeSettings,
  resolveDefaultBorderPreset,
  resolveDefaultBorderPresetVisual,
} from './highlighter-projection';
import type { BorderPreset } from '@sniptale/ui/highlighter-style/types';

function createPreset(overrides: Partial<BorderPreset> = {}): BorderPreset {
  return {
    id: 'preset-1',
    name: 'Preset',
    order: 0,
    width: 6,
    color: '#2563eb',
    style: 'dashed',
    radius: 12,
    padding: { top: 2, right: 4, bottom: 6, left: 8 },
    shadow: BORDER_SHADOW_SOFT_INTENSITY,
    opacity: 42,
    strokeOpacity: 70,
    fillColor: '#16a34a',
    fillOpacity: 35,
    inheritCustomCss: true,
    customCss: 'outline: 1px solid red;',
    ...overrides,
  };
}

describe('highlighter preset projection', () => {
  it('maps presets to the portable editor shape subset', () => {
    expect(projectBorderPresetToEditorShapeSettings(createPreset())).toEqual({
      borderPresetId: 'preset-1',
      customCss: '',
      fillColor: '#16a34a',
      fillOpacity: 0.35,
      inheritCustomCss: false,
      opacity: 0.7,
      radius: 12,
      shadow: BORDER_SHADOW_SOFT_INTENSITY,
      shadowAngle: 90,
      shadowBlur: 12,
      shadowColor: '#2563eb',
      shadowDistance: 4,
      strokeColor: '#2563eb',
      strokeOpacity: 0.7,
      strokeStyle: 'dashed',
      strokeWidth: 6,
    });
  });
});

describe('highlighter default preset projection', () => {
  it('resolves the current default preset and visual payload from settings', () => {
    const fallbackPreset = createPreset({ id: 'fallback' });
    const selectedPreset = createPreset({ color: '#f97316', id: 'selected' });
    const settings = {
      borderPresets: [fallbackPreset, selectedPreset],
      defaultBorderPresetId: 'selected',
    };

    expect(resolveDefaultBorderPreset(settings, fallbackPreset)).toEqual(selectedPreset);
    expect(resolveDefaultBorderPresetVisual(settings, fallbackPreset)).toMatchObject({
      id: 'selected',
      opacity: 42,
      strokeColor: '#f97316',
      strokeWidth: 6,
    });
  });
});

describe('highlighter stale preset projection', () => {
  it('falls back to a cloned preset when settings are missing or stale', () => {
    const fallbackPreset = createPreset({ id: 'fallback', color: '#0f172a' });

    expect(resolveDefaultBorderPreset(undefined, fallbackPreset)).toEqual(fallbackPreset);
    expect(resolveDefaultBorderPreset(undefined, fallbackPreset)).not.toBe(fallbackPreset);
    expect(
      resolveDefaultBorderPreset(
        { borderPresets: [fallbackPreset], defaultBorderPresetId: 'missing' },
        fallbackPreset
      )
    ).toEqual(fallbackPreset);
  });
});
