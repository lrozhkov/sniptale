import { describe, expect, it } from 'vitest';
import {
  coerceBorderShadowIntensity,
  normalizeBorderPresetVisualFields,
  normalizeBorderShadowIntensity,
  percentToUnit,
} from './normalize';
import type { BorderPreset } from './types';

const PRESET: BorderPreset = {
  color: '#fff',
  customCss: '',
  fillColor: '#123456',
  fillOpacity: 20,
  id: 'preset-1',
  inheritCustomCss: true,
  name: 'Preset',
  opacity: 75,
  order: 0,
  padding: { bottom: 0, left: 0, right: 0, top: 0 },
  radius: 4,
  shadow: 30,
  strokeOpacity: 80,
  style: 'solid',
  width: 2,
};

describe('highlighter style normalization', () => {
  it('coerces finite, legacy, and out-of-range shadow intensities', () => {
    expect(coerceBorderShadowIntensity(42.6)).toBe(43);
    expect(coerceBorderShadowIntensity(140)).toBe(100);
    expect(coerceBorderShadowIntensity('soft')).toBe(30);
    expect(coerceBorderShadowIntensity('unknown')).toBeNull();
    expect(coerceBorderShadowIntensity(Number.NaN)).toBeNull();
  });

  it('normalizes fallback values without replacing explicit visual fields', () => {
    expect(normalizeBorderShadowIntensity(undefined, -10)).toBe(0);
    expect(percentToUnit(125)).toBe(1);
    expect(normalizeBorderPresetVisualFields(PRESET)).toEqual(PRESET);
  });
});
