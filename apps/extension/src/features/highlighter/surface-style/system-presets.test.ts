import { expect, it } from 'vitest';
import {
  getSystemSurfaceStylePresets,
  SYSTEM_SURFACE_STYLE_CATALOG_REVISION,
} from './system-presets';

it('returns twelve independent data-only system recipes at revision three', () => {
  const first = getSystemSurfaceStylePresets();
  const second = getSystemSurfaceStylePresets();
  expect(SYSTEM_SURFACE_STYLE_CATALOG_REVISION).toBe(3);
  expect(first).toHaveLength(12);
  expect(first.map((preset) => preset.id)).toEqual([
    'system-surface-plain',
    'system-surface-ink',
    'system-surface-tonal-warm',
    'system-surface-tonal-cool',
    'system-surface-soft-elevated',
    'system-surface-frosted-light',
    'system-surface-frosted-dark',
    'system-surface-clear-tint',
    'system-surface-acrylic-light',
    'system-surface-acrylic-dark',
    'system-surface-mica',
    'system-surface-liquid-glow',
  ]);
  expect(first[7]?.style.fillPaint.kind).toBe('gradient');
  expect(first[0]?.style).not.toBe(second[0]?.style);
});
