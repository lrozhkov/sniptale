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
  clone.placement.anchor = 'bottom-right';
  clone.style.connector.width = 7;
  clone.style.title.enabled = true;
  expect(source.style.connector.width).toBe(2);
  expect(source.placement.anchor).toBe('top-center');
  expect(source.style.title.enabled).toBe(false);
});

it('provides distinct annotation roles and a ring-dot endpoint preset', () => {
  const presets = createSystemCalloutPresetCatalog();
  const pinpoint = presets.find((preset) => preset.id === 'system-callout-pointer-note')!;
  const info = presets.find((preset) => preset.id === 'system-callout-header-card')!;
  const warning = presets.find((preset) => preset.id === 'system-callout-framed-note')!;

  expect(pinpoint.style.connector).toMatchObject({
    color: '#2563EB',
    frameMarker: 'ring-dot',
    frameMarkerSize: 12,
    kind: 'line',
  });
  expect(info.style).toMatchObject({
    connector: { routing: 'elbow' },
    surface: { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' },
    title: { backgroundColor: '#2563EB', enabled: true },
  });
  expect(warning.style).toMatchObject({
    connector: { color: '#D97706', frameMarker: 'arrow' },
    surface: { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' },
    title: { backgroundColor: '#F59E0B', enabled: true },
  });
});
