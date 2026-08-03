import { expect, it } from 'vitest';
import {
  cloneCalloutPreset,
  createSystemCalloutPresetCatalog,
  SYSTEM_CALLOUT_PRESET_CATALOG_REVISION,
} from './catalog';

it('creates the six stable system callout presets with independent styles', () => {
  const presets = createSystemCalloutPresetCatalog();
  expect(presets.map((preset) => preset.id)).toEqual([
    'system-callout-bubble',
    'system-callout-card',
    'system-callout-text',
    'system-callout-pointer-note',
    'system-callout-header-card',
    'system-callout-framed-note',
  ]);
  expect(
    presets.every((preset) => preset.basedOnRevision === SYSTEM_CALLOUT_PRESET_CATALOG_REVISION)
  ).toBe(true);
  presets[0]!.style.surface.radius = 99;
  expect(createSystemCalloutPresetCatalog()[0]!.style.surface.radius).toBe(12);
});

it('deep-clones every nested visual role', () => {
  const source = createSystemCalloutPresetCatalog()[0]!;
  const clone = cloneCalloutPreset(source);
  clone.style.connector.width = 7;
  clone.style.title.enabled = true;
  expect(source.style.connector.width).toBe(2);
  expect(source.style.title.enabled).toBe(false);
});
