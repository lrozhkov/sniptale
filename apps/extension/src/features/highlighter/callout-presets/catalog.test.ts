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
  expect(presets.every((preset) => preset.style.badge.text === '')).toBe(true);
  presets[0]!.style.surface.radius = 99;
  expect(createSystemCalloutPresetCatalog()[0]!.style.surface.radius).toBe(12);
});

it('deep-clones every nested visual role', () => {
  const source = createSystemCalloutPresetCatalog()[0]!;
  source.style.connector.curve = {
    curvature: 0.5,
    endHandle: { x: 30, y: -12 },
    mode: 'manual',
    startHandle: { x: -20, y: 18 },
  };
  const clone = cloneCalloutPreset(source);
  clone.placement.anchor = 'bottom-right';
  clone.style.connector.width = 7;
  clone.style.title.enabled = true;
  clone.style.connector.curve.startHandle!.x = 99;
  clone.style.connector.curve.endHandle!.y = 99;
  expect(source.style.connector.width).toBe(2);
  expect(source.placement.anchor).toBe('top-center');
  expect(source.style.title.enabled).toBe(false);
  expect(source.style.connector.curve.startHandle).toEqual({ x: -20, y: 18 });
  expect(source.style.connector.curve.endHandle).toEqual({ x: 30, y: -12 });
});

it('normalizes absent optional preset fields without mutating the source', () => {
  const source = createSystemCalloutPresetCatalog()[0]!;
  delete source.placement.connectorAttachments;
  Reflect.deleteProperty(source.style, 'customCss');
  const clone = cloneCalloutPreset(source);

  expect(clone.placement.connectorAttachments).toEqual({
    block: { mode: 'auto' },
    frame: { mode: 'auto' },
  });
  expect(clone.style.customCss).toBe('');
  expect(source.placement.connectorAttachments).toBeUndefined();
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
    surface: { fillPaint: { kind: 'solid', color: '#f8fafcff' }, borderColor: '#486581' },
    title: { backgroundColor: '#243B53', dividerColor: '#243B53', dividerWidth: 2, enabled: true },
  });
  expect(warning.style).toMatchObject({
    accentEdge: { color: '#D99000', enabled: true, side: 'left' },
    connector: { color: '#8A5A00', frameMarker: 'diamond', width: 2 },
    surface: { fillPaint: { kind: 'solid', color: '#fff9e8ff' }, borderColor: '#E8C56A' },
    title: { dividerColor: '#D99000', dividerWidth: 2, enabled: true },
  });
  expect(warning.style.connector.frameMarker).not.toBe('arrow');
});
