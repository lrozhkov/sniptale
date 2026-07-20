import { describe, expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../../features/editor/document/rich-shape';
import { createRichShapeStyleFromArrowSettings, createRichShapeStylePatch } from './patch';

describe('rich shape settings patch owner', () => {
  it('maps arrowheads and opacity into rich shape line style', () => {
    const style = createRichShapeStyleFromArrowSettings(createDefaultRichShapeObject().style, {
      color: '#ff0000',
      endHead: 'block',
      mode: 'straight',
      opacity: 0.35,
      shadow: 0,
      startHead: 'circle',
      variant: 'standard',
      width: 7,
    } as never);

    expect(style.line).toEqual(
      expect.objectContaining({ beginArrowhead: 'oval', endArrowhead: 'triangle', width: 7 })
    );
    expect(style.line.transparency).toBe(0.65);
  });

  it('uses rectangle settings for non-line rich shapes', () => {
    const shape = createDefaultRichShapeObject({ shapeFamily: 'office' });

    expect(
      createRichShapeStylePatch(shape, {
        rectangle: {
          fillColor: '#00ff00',
          fillOpacity: 0.25,
          opacity: 0.8,
          radius: 9,
          strokeColor: '#0000ff',
          strokeOpacity: 0.75,
          strokeStyle: 'dotted',
          strokeWidth: 4,
        },
      } as never)
    ).toEqual(
      expect.objectContaining({
        fill: { type: 'solid', color: '#00ff00' },
        fillTransparency: 0.75,
        line: expect.objectContaining({ dashStyle: 'dot', width: 4 }),
      })
    );
  });
});
