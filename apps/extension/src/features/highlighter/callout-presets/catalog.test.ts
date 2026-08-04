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
    color: '#172033',
    frameMarker: 'ring-dot',
    frameMarkerSize: 11,
    kind: 'line',
    routing: 'polyline',
    width: 1,
  });
  expect(pinpoint.style.title).toMatchObject({
    dividerColor: '#172033',
    dividerWidth: 1,
    enabled: true,
  });
  expect(info.style).toMatchObject({
    connector: { frameMarker: 'square', routing: 'polyline', width: 2 },
    surface: { backgroundColor: '#F8FAFC', borderColor: '#486581' },
    title: { backgroundColor: '#243B53', dividerColor: '#243B53', dividerWidth: 2, enabled: true },
  });
  expect(warning.style).toMatchObject({
    accentEdge: { color: '#D99000', enabled: true, side: 'left' },
    connector: { color: '#8A5A00', frameMarker: 'diamond', width: 2 },
    surface: { backgroundColor: '#FFF9E8', borderColor: '#E8C56A' },
    title: { dividerColor: '#D99000', dividerWidth: 2, enabled: true },
  });
  expect(warning.style.connector.frameMarker).not.toBe('arrow');
});
