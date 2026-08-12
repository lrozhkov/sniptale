import { createSolidPaint } from '@sniptale/foundation/paint';
import { expect, it } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../callout-presets/catalog';
import { applySurfaceStyleToCallout } from './operations';
import { projectCalloutCardStyle } from './card-projection';

it('projects Paint and canonical card CSS through one inert card style', () => {
  const base = createSystemCalloutPresetCatalog()[0]!.style;
  const style = applySurfaceStyleToCallout(base, {
    fillPaint: createSolidPaint('#ffffff80'),
    surfaceCss: 'backdrop-filter: blur(16px);',
  });
  expect(projectCalloutCardStyle(style)).toEqual(
    expect.objectContaining({ background: '#ffffff80', backdropFilter: 'blur(16px)' })
  );
});

it('keeps native and custom surface shadows as independent visual effects', () => {
  const withoutShadow = createSystemCalloutPresetCatalog()[0]!.style;
  withoutShadow.surface.shadow = 0;
  expect(projectCalloutCardStyle(withoutShadow)['boxShadow']).toBe('none');

  withoutShadow.customCss = '[card]\nbox-shadow: inset 0 1px 0 #ffffff59;';
  expect(projectCalloutCardStyle(withoutShadow)['boxShadow']).toBe('inset 0 1px 0 #ffffff59');

  const withShadow = createSystemCalloutPresetCatalog()[0]!.style;
  withShadow.surface.shadow = 12;
  withShadow.surface.shadowColor = '#ff0000';
  expect(projectCalloutCardStyle(withShadow)['boxShadow']).toBe('0 4px 12px #ff0000');

  withShadow.customCss = '[card]\nbox-shadow: none;';
  expect(projectCalloutCardStyle(withShadow)['boxShadow']).toBe('0 4px 12px #ff0000');

  withShadow.customCss = '[card]\nbox-shadow: inset 0 1px 0 #ffffff59;';
  expect(projectCalloutCardStyle(withShadow)['boxShadow']).toBe(
    '0 4px 12px #ff0000, inset 0 1px 0 #ffffff59'
  );
});

it('can suppress the native fill without dropping the projected surface behavior', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  style.customCss = '[card]\nbackdrop-filter: blur(16px);';

  expect(projectCalloutCardStyle(style, { suppressNativeFill: true })).toEqual(
    expect.objectContaining({ background: 'transparent', backdropFilter: 'blur(16px)' })
  );
});
