import { createSolidPaint } from '@sniptale/foundation/paint';
import { expect, it } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../callout-presets/catalog';
import {
  applySurfaceStyleToCallout,
  cloneSurfaceStylePreset,
  getCalloutSurfaceStyle,
  matchSurfaceStylePreset,
} from './operations';

it('applies only fillPaint and the card section', () => {
  const original = createSystemCalloutPresetCatalog()[0]!.style;
  const next = applySurfaceStyleToCallout(original, {
    fillPaint: createSolidPaint('#12345678'),
    surfaceCss: 'backdrop-filter: blur(10px);',
  });
  expect(next.surface.fillPaint).toEqual(createSolidPaint('#12345678'));
  expect(next.customCss).toContain('[card]');
  expect(next.connector).toEqual(original.connector);
  expect(next.title).toEqual(original.title);
  expect(getCalloutSurfaceStyle(next)?.surfaceCss).toBe('backdrop-filter: blur(10px);');
});

it('fails closed for malformed sections and matches detached semantic snapshots', () => {
  const original = createSystemCalloutPresetCatalog()[0]!.style;
  expect(getCalloutSurfaceStyle({ ...original, customCss: '[card]\nposition: fixed;' })).toBeNull();
  expect(() =>
    applySurfaceStyleToCallout(original, {
      fillPaint: createSolidPaint('#fff'),
      surfaceCss: 'position: fixed;',
    })
  ).toThrow(TypeError);
  expect(() =>
    applySurfaceStyleToCallout(original, {
      fillPaint: createSolidPaint('#fff'),
      surfaceCss: 'background-image: src("https://attacker.example/pixel");',
    })
  ).toThrow(TypeError);
  expect(() =>
    applySurfaceStyleToCallout(
      { ...original, customCss: '[broken' },
      {
        fillPaint: createSolidPaint('#fff'),
        surfaceCss: '',
      }
    )
  ).toThrow(TypeError);
  const preset = {
    id: 'matching',
    name: 'Matching',
    origin: 'user' as const,
    style: { fillPaint: createSolidPaint('#fff'), surfaceCss: '' },
  };
  expect(matchSurfaceStylePreset(preset.style, [preset])).toBe(preset);
  expect(
    matchSurfaceStylePreset({ ...preset.style, surfaceCss: 'color: red;' }, [preset])
  ).toBeNull();
  const cloned = cloneSurfaceStylePreset(preset);
  cloned.style.fillPaint = createSolidPaint('#000');
  expect(preset.style.fillPaint).toEqual(createSolidPaint('#fff'));
});
