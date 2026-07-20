import { expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { createRichShapeStyleFromArrowSettings, createRichShapeStylePatch } from './style/patch';
import {
  createRichShapeStrokeDashArray,
  resolveRichShapeRenderableStyle,
} from './style/renderable';

function createArrowStyle(overrides: Record<string, unknown>) {
  return createRichShapeStyleFromArrowSettings(createDefaultRichShapeObject().style, {
    color: '#ff0000',
    mode: 'straight',
    opacity: 1,
    shadow: 0,
    variant: 'standard',
    width: 3,
    ...overrides,
  } as never).line;
}

it('projects dash, transparency, and shadow into Fabric style values', () => {
  const shape = createDefaultRichShapeObject({
    effects: {
      ...createDefaultRichShapeObject().effects,
      shadow: {
        angle: 0,
        blur: 8,
        color: '#000000',
        distance: 4,
        enabled: true,
        opacity: 0.5,
      },
    },
    style: {
      ...createDefaultRichShapeObject().style,
      fillTransparency: 0.25,
      line: {
        ...createDefaultRichShapeObject().style.line,
        dashStyle: 'dash-dot',
        transparency: 0.4,
        width: 3,
      },
    },
  });

  const style = resolveRichShapeRenderableStyle(shape);

  expect(style.fill).toBe('rgba(255, 255, 255, 0.75)');
  expect(style.stroke).toBe('rgba(17, 24, 39, 0.6)');
  expect(style.strokeDashArray).toEqual([10, 6, 3, 6]);
  expect(style.shadow).toEqual(expect.objectContaining({ blur: 8, offsetX: 4 }));
  expect(createRichShapeStrokeDashArray('dash-dot', 3)).toEqual([10, 6, 3, 6]);
  expect(
    resolveRichShapeRenderableStyle(
      createDefaultRichShapeObject({
        effects: {
          ...createDefaultRichShapeObject().effects,
          shadow: { ...shape.effects.shadow, opacity: 0 },
        },
      })
    ).shadow
  ).toBeUndefined();
});

it('projects linear, radial, and transparent fills deterministically', () => {
  const linear = resolveRichShapeRenderableStyle(
    createDefaultRichShapeObject({
      frame: { height: 100, left: 0, top: 0, width: 200 },
      style: {
        ...createDefaultRichShapeObject().style,
        fill: {
          type: 'gradient',
          gradientType: 'linear',
          angle: 45,
          stops: [
            { color: '#ffffff', offset: -1, transparency: Number.NaN },
            { color: '#000000', offset: 2, transparency: 50 },
          ],
        },
      },
    })
  );
  const radial = resolveRichShapeRenderableStyle(
    createDefaultRichShapeObject({
      frame: { height: 120, left: 0, top: 0, width: 80 },
      style: {
        ...createDefaultRichShapeObject().style,
        fill: {
          type: 'gradient',
          gradientType: 'radial',
          angle: 0,
          stops: [
            { color: '#ff0000', offset: 0, transparency: 0 },
            { color: '#0000ff', offset: 1, transparency: 0 },
          ],
        },
      },
    })
  );
  const transparent = resolveRichShapeRenderableStyle(
    createDefaultRichShapeObject({
      style: {
        ...createDefaultRichShapeObject().style,
        fill: { type: 'image', assetId: null, fit: 'cover' },
      },
    })
  );

  expect(linear.fill).toEqual(expect.objectContaining({ type: 'linear' }));
  expect(radial.fill).toEqual(expect.objectContaining({ type: 'radial' }));
  expect(transparent.fill).toBe('transparent');
});

it('maps supported dash presets', () => {
  expect(createRichShapeStrokeDashArray('solid', 2)).toBeUndefined();
  expect(createRichShapeStrokeDashArray('dash', 4)).toEqual([12, 6.4]);
  expect(createRichShapeStrokeDashArray('dot', 2)).toEqual([2, 6]);
  expect(createRichShapeStrokeDashArray('long-dash', 4)).toEqual([20, 7.2]);
});

it('maps arrowhead settings onto rich shape line style', () => {
  const line = createArrowStyle({
    endHead: 'block',
    opacity: 0.35,
    startHead: 'circle',
    width: 7,
  });

  expect(line).toEqual(
    expect.objectContaining({
      beginArrowhead: 'oval',
      color: '#ff0000',
      endArrowhead: 'triangle',
      transparency: 0.65,
      width: 7,
    })
  );
  expect(createArrowStyle({ endHead: 'open', startHead: 'diamond' })).toEqual(
    expect.objectContaining({ beginArrowhead: 'diamond', endArrowhead: 'open' })
  );
  expect(createArrowStyle({ endHead: 'triangle-outline', startHead: 'crosshair-circle' })).toEqual(
    expect.objectContaining({ beginArrowhead: 'oval', endArrowhead: 'triangle' })
  );
});

it('uses arrow settings for line families and rectangle settings for office shapes', () => {
  const lineShape = createDefaultRichShapeObject({ shapeFamily: 'line' });
  const officeShape = createDefaultRichShapeObject({ shapeFamily: 'office' });
  const settings = {
    arrow: {
      color: '#111111',
      endHead: 'diamond',
      mode: 'straight',
      opacity: 0.5,
      shadow: 0,
      startHead: 'none',
      variant: 'standard',
      width: 5,
    },
    rectangle: {
      borderPresetId: null,
      customCss: '',
      fillColor: '#00ff00',
      fillOpacity: 0.25,
      inheritCustomCss: false,
      opacity: 0.8,
      radius: 9,
      shadow: 0,
      strokeColor: '#0000ff',
      strokeOpacity: 0.75,
      strokeStyle: 'dotted',
      strokeWidth: 4,
    },
  };

  expect(createRichShapeStylePatch(lineShape, settings as never).line.endArrowhead).toBe('diamond');
  expect(createRichShapeStylePatch(officeShape, settings as never)).toEqual(
    expect.objectContaining({
      fill: { type: 'solid', color: '#00ff00' },
      fillTransparency: 0.75,
      line: expect.objectContaining({ dashStyle: 'dot', width: 4 }),
    })
  );
});
