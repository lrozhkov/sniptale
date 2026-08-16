import { expect, it } from 'vitest';
import {
  createStepBadgeSettingsFromTemplate,
  createStepBadgeTemplateFromSettings,
  createSystemStepBadgePresetCatalog,
  getCanonicalSystemStepBadgePreset,
} from './catalog';

it('provides fifteen independent stable system templates', () => {
  const presets = createSystemStepBadgePresetCatalog();
  expect(presets.map((preset) => preset.id)).toEqual([
    'system-classic',
    'system-outline',
    'system-pill',
    'system-compact',
    'system-letters',
    'system-stamp',
    'system-large',
    'system-neon-orbit',
    'system-neon-square',
    'system-editorial-counter',
    'system-editorial-index',
    'system-editorial-mark',
    'system-retro-sunset',
    'system-retro-arcade',
    'system-retro-memphis',
  ]);
  expect(presets.find((preset) => preset.id === 'system-compact')?.settings.style.sizeSource).toBe(
    'frame-border'
  );
  expect(presets.find((preset) => preset.id === 'system-large')?.settings.style.sizeSource).toBe(
    'frame-border'
  );
  expect(presets[0]?.settings.style.outlineWidth).toBe(2);
  expect(presets.find((preset) => preset.id === 'system-letters')?.settings).toMatchObject({
    alphabet: 'latin',
    auto: true,
    type: 'letter',
  });
  presets[0]!.settings.style.diameter = 99;
  expect(createSystemStepBadgePresetCatalog()[0]!.settings.style.diameter).toBe(29.16);
});

it('normalizes legacy settings and returns independent canonical system snapshots', () => {
  const template = createStepBadgeTemplateFromSettings(
    {
      auto: false,
      corner: 'bottom-right',
      enabled: true,
      offsetDirections: ['left'],
      type: 'letter',
      value: 'Б',
    },
    34
  );
  expect(template).toMatchObject({
    alphabet: 'cyrillic',
    anchor: 'bottom-right',
    auto: false,
    style: { diameter: 34 },
  });
  const canonical = getCanonicalSystemStepBadgePreset('system-outline');
  canonical.settings.style.backgroundColor = '#000000';
  expect(getCanonicalSystemStepBadgePreset('system-outline').settings.style.backgroundColor).toBe(
    '#f97316'
  );
  expect(createStepBadgeSettingsFromTemplate(template)).not.toHaveProperty('sourcePresetId');
});

it('applies a template as a deep frame snapshot without runtime placement', () => {
  const preset = createSystemStepBadgePresetCatalog()[0]!;
  const settings = createStepBadgeSettingsFromTemplate(preset.settings, preset.id);
  expect(settings).toMatchObject({ enabled: true, sourcePresetId: preset.id });
  expect(settings).not.toHaveProperty('manualPlacement');
  settings.style.diameter = 80;
  expect(preset.settings.style.diameter).toBe(29.16);
});
