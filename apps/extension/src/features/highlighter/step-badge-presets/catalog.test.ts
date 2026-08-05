import { expect, it } from 'vitest';
import {
  createStepBadgeSettingsFromTemplate,
  createStepBadgeTemplateFromSettings,
  createSystemStepBadgePresetCatalog,
  getCanonicalSystemStepBadgePreset,
} from './catalog';

it('provides five independent stable system templates', () => {
  const presets = createSystemStepBadgePresetCatalog();
  expect(presets.map((preset) => preset.id)).toEqual([
    'system-classic',
    'system-outline',
    'system-compact',
    'system-large',
    'system-letters',
  ]);
  expect(presets.find((preset) => preset.id === 'system-compact')?.settings.style.diameter).toBe(
    24
  );
  expect(presets.find((preset) => preset.id === 'system-large')?.settings.style.diameter).toBe(40);
  expect(presets.find((preset) => preset.id === 'system-letters')?.settings).toMatchObject({
    alphabet: 'cyrillic',
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
    '#ffffff'
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
