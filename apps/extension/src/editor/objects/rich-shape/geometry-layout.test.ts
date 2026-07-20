// @vitest-environment jsdom

import { Rect } from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { createBoundsObject, positionRichShapeChild, positionTextChild } from './geometry-layout';

describe('rich shape local geometry layout', () => {
  it('creates invisible bounds from the authoritative shape frame', () => {
    const bounds = createBoundsObject(
      createDefaultRichShapeObject({ frame: { height: 40, left: 5, top: 6, width: 80 } })
    );

    expect(bounds.width).toBe(80);
    expect(bounds.height).toBe(40);
    expect(bounds.opacity).toBe(0);
  });

  it('positions shape children from both explicit and missing child coordinates', () => {
    const explicit = positionRichShapeChild(new Rect({ left: 10, top: 8 }), 80, 40);
    const shape = createDefaultRichShapeObject();
    const fallback = positionTextChild(new Rect(), shape);
    const missingCoordinates = { set: vi.fn() };

    expect(explicit.left).toBe(-30);
    expect(explicit.top).toBe(-12);
    expect(fallback.left).toBe(-shape.frame.width / 2);
    positionRichShapeChild(missingCoordinates as never, 20, 10);
    expect(missingCoordinates.set).toHaveBeenCalledWith({ left: -10, top: -5 });
  });
});
