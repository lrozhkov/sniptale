import { createSolidPaint } from '@sniptale/foundation/paint';
import { expect, it } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../callout-presets/catalog';
import { applySurfaceStyleToCallout } from './operations';
import { parseResolvedCalloutBoxShadow, resolveCalloutSurfaceProjection } from './card-projection';

it('projects Paint, backdrop, and foreground through explicit semantic roles', () => {
  const base = createSystemCalloutPresetCatalog()[0]!.style;
  const style = applySurfaceStyleToCallout(base, {
    fillPaint: createSolidPaint('#ffffff80'),
    surfaceCss: 'backdrop-filter: blur(16px);\ncolor: #123456;',
  });
  const projection = resolveCalloutSurfaceProjection(style);

  expect(projection.fillPaint).toEqual(createSolidPaint('#ffffff80'));
  expect(projection.backdropStyle).toEqual({ backdropFilter: 'blur(16px)' });
  expect(projection.contentStyle).toEqual({ color: '#123456' });
});

it('retains native elevation for runtime composition with custom shadows', () => {
  const withShadow = createSystemCalloutPresetCatalog()[0]!.style;
  withShadow.surface.shadow = 12;
  withShadow.surface.shadowColor = '#ff0000';
  expect(resolveCalloutSurfaceProjection(withShadow).shadows).toEqual([
    expect.objectContaining({ blur: 12, color: '#ff0000', inset: false, offsetY: 4 }),
  ]);

  withShadow.customCss = '[card]\nbox-shadow: none;';
  expect(resolveCalloutSurfaceProjection(withShadow)).toEqual(
    expect.objectContaining({
      customBoxShadow: 'none',
      shadows: [expect.objectContaining({ blur: 12, color: '#ff0000', inset: false })],
    })
  );

  withShadow.customCss = '[card]\nbox-shadow: inset 0 1px 0 #ffffff59;';
  const projection = resolveCalloutSurfaceProjection(withShadow);
  expect(projection.shadows).toEqual([
    expect.objectContaining({ blur: 12, color: '#ff0000', inset: false }),
  ]);
  expect(projection.customBoxShadow).toBe('inset 0 1px 0 #ffffff59');
  expect(parseResolvedCalloutBoxShadow('inset rgb(255, 255, 255) 0px 1px 0px 0px')).toEqual([
    {
      blur: 0,
      color: 'rgb(255, 255, 255)',
      inset: true,
      offsetX: 0,
      offsetY: 1,
      spread: 0,
    },
  ]);

  withShadow.customCss = '[card]\nbox-shadow: red 0 2px 4px;';
  expect(resolveCalloutSurfaceProjection(withShadow)).toEqual(
    expect.objectContaining({
      customBoxShadow: 'red 0 2px 4px',
      shadows: [expect.objectContaining({ blur: 12, color: '#ff0000', inset: false })],
    })
  );

  withShadow.customCss = '[card]\nbox-shadow: 0 0.5em 1em red;';
  const unresolved = resolveCalloutSurfaceProjection(withShadow);
  expect(unresolved.shadows).toEqual([
    expect.objectContaining({ blur: 12, color: '#ff0000', inset: false }),
  ]);
  expect(unresolved.customBoxShadow).toBe('0 0.5em 1em red');
});

it('rejects non-canonical negative blur when parsing a browser shadow result', () => {
  expect(parseResolvedCalloutBoxShadow('rgb(0, 0, 0) 0px 0px -2px 0px')).toBeNull();
});

it('keeps post effects away from paint and foreground roles', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  style.customCss = [
    '[card]',
    'background: #123456;',
    'filter: blur(2px);',
    'opacity: 0.7;',
    'text-shadow: 0 1px 1px #000;',
  ].join('\n');
  const projection = resolveCalloutSurfaceProjection(style);

  expect(projection.paintStyle).toEqual({ background: '#123456' });
  expect(projection.effectStyle).toEqual({ filter: 'blur(2px)', opacity: '0.7' });
  expect(projection.contentStyle.textShadow).toBe('0 1px 1px #000');
  expect(projection.paintStyle).not.toHaveProperty('filter');
  expect(projection.contentStyle).not.toHaveProperty('opacity');
});
