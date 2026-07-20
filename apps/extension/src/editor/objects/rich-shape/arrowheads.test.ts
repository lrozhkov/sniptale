import { Ellipse, Path, Polygon } from 'fabric';
import { describe, expect, it } from 'vitest';
import {
  createDefaultRichShapeObject,
  createEnabledRichShapeRoughStyle,
} from '../../../features/editor/document/rich-shape';
import { createArrowheadObject, createArrowheadObjects } from './arrowheads';
import type { RichShapeRenderableStyle } from './style/renderable';

function createStyle(overrides: Partial<RichShapeRenderableStyle> = {}): RichShapeRenderableStyle {
  return {
    fill: '#ffffff',
    stroke: '#112233',
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    strokeWidth: 4,
    ...overrides,
  };
}

describe('rich shape arrowheads', () => {
  it('skips disabled arrowheads', () => {
    expect(
      createArrowheadObject('none', { x: 20, y: 0 }, { x: 0, y: 0 }, createStyle())
    ).toBeNull();
  });

  it('creates open, diamond, oval, and triangle arrowhead primitives', () => {
    const tip = { x: 40, y: 10 };
    const from = { x: 0, y: 10 };

    expect(createArrowheadObject('open', tip, from, createStyle())).toBeInstanceOf(Path);
    expect(createArrowheadObject('diamond', tip, from, createStyle())).toBeInstanceOf(Polygon);
    expect(createArrowheadObject('oval', tip, from, createStyle())).toBeInstanceOf(Ellipse);
    expect(createArrowheadObject('triangle', tip, from, createStyle())).toBeInstanceOf(Polygon);
  });

  it('projects dash and shadow options to arrowhead primitives', () => {
    const object = createArrowheadObject(
      'triangle',
      { x: 40, y: 10 },
      { x: 0, y: 10 },
      createStyle({
        shadow: { blur: 3, color: '#000000', offsetX: 1, offsetY: 2 } as never,
        strokeDashArray: [6, 3],
      })
    );

    expect(object?.strokeDashArray).toEqual([6, 3]);
    expect(object?.shadow).toBeTruthy();
  });

  it('creates rough arrowhead primitives for filled, open, and oval heads', () => {
    const shape = createDefaultRichShapeObject({
      id: 'rough-arrowhead',
      rough: createEnabledRichShapeRoughStyle('rough-arrowhead'),
    });
    const tip = { x: 40, y: 10 };
    const from = { x: 0, y: 10 };

    expect(createArrowheadObjects('triangle', tip, from, createStyle(), shape, 1)).not.toEqual([]);
    expect(createArrowheadObjects('open', tip, from, createStyle(), shape, 2)).not.toEqual([]);
    expect(createArrowheadObjects('diamond', tip, from, createStyle(), shape, 3)).not.toEqual([]);
    expect(createArrowheadObjects('oval', tip, from, createStyle(), shape, 4)).not.toEqual([]);
    expect(createArrowheadObjects('none', tip, from, createStyle(), shape, 5)).toEqual([]);
  });
});
