import { describe, expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../../features/editor/document/rich-shape';
import { createRichShapeStrokeDashArray, resolveRichShapeRenderableStyle } from './renderable';

describe('rich shape renderable style owner', () => {
  it('projects solid fill, stroke dash, and shadow into Fabric render style', () => {
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
  });

  it('maps dash presets and unsupported fills', () => {
    expect(createRichShapeStrokeDashArray('solid', 2)).toBeUndefined();
    expect(createRichShapeStrokeDashArray('long-dash', 4)).toEqual([20, 7.2]);
    expect(
      resolveRichShapeRenderableStyle(
        createDefaultRichShapeObject({
          style: {
            ...createDefaultRichShapeObject().style,
            fill: { type: 'image', assetId: null, fit: 'cover' },
          },
        })
      ).fill
    ).toBe('transparent');
  });
});
