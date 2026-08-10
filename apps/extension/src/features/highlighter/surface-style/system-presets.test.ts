import { expect, it } from 'vitest';
import {
  getSystemSurfaceStylePresets,
  SYSTEM_SURFACE_STYLE_CATALOG_REVISION,
} from './system-presets';

it('returns five independent data-only system recipes at revision one', () => {
  const first = getSystemSurfaceStylePresets();
  const second = getSystemSurfaceStylePresets();
  expect(SYSTEM_SURFACE_STYLE_CATALOG_REVISION).toBe(1);
  expect(first.map((preset) => preset.id)).toEqual([
    'system-surface-plain',
    'system-surface-frosted-light',
    'system-surface-frosted-dark',
    'system-surface-clear-tint',
    'system-surface-soft-elevated',
  ]);
  expect(first[3]?.style.fillPaint.kind).toBe('gradient');
  expect(first[0]?.style).not.toBe(second[0]?.style);
});
