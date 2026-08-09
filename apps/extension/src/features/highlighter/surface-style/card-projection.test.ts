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
