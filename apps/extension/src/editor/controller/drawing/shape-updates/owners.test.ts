import { Ellipse, Point, Polygon, Rect } from 'fabric';
import { expect, it } from 'vitest';
import { createRectangleDraftBounds } from './bounds';
import { updateDiamondDraft } from './diamond';
import { updateEllipseDraft } from './ellipse';
import { updateCropDraft, updateRectangleDraft } from './rect';

const shapeSettings = { strokeWidth: 6 } as never;

it('keeps rectangle stroke inset inside the bounds owner', () => {
  expect(createRectangleDraftBounds(new Point(10, 20), new Point(13, 24), 8)).toEqual({
    height: 1,
    left: 14,
    top: 24,
    width: 1,
  });
});

it('keeps rectangle and crop updates owned by rect-backed draft logic', () => {
  const rectangle = new Rect({ left: 0, top: 0, width: 1, height: 1 });
  const cropGuide = new Rect({ left: 0, top: 0, width: 1, height: 1 });

  expect(
    updateRectangleDraft(
      { object: rectangle, start: { x: 10, y: 20 }, tool: 'rectangle' } as never,
      new Point(30, 50),
      shapeSettings
    )
  ).toBeNull();
  expect(rectangle.left).toBe(13);
  expect(rectangle.top).toBe(23);
  expect(rectangle.width).toBe(14);
  expect(rectangle.height).toBe(24);

  expect(
    updateCropDraft(
      { object: cropGuide, start: { x: 30, y: 50 }, tool: 'crop' } as never,
      new Point(10, 20)
    )
  ).toEqual({ height: 30, left: 10, top: 20, width: 20 });
});

it('keeps ellipse draft math in the ellipse owner', () => {
  const ellipse = new Ellipse({ rx: 1, ry: 1 });

  expect(
    updateEllipseDraft(
      { object: ellipse, start: { x: 10, y: 20 }, tool: 'ellipse' } as never,
      new Point(30, 50)
    )
  ).toBeNull();
  expect(ellipse.rx).toBe(10);
  expect(ellipse.ry).toBe(15);
});

it('keeps diamond point generation in the diamond owner', () => {
  const diamond = new Polygon(
    [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ],
    { left: 0, top: 0 }
  );

  expect(
    updateDiamondDraft(
      { object: diamond, start: { x: 10, y: 20 }, tool: 'diamond' } as never,
      new Point(30, 50)
    )
  ).toBeNull();
  expect(diamond.points).toEqual([
    { x: 0, y: -15 },
    { x: 10, y: 0 },
    { x: 0, y: 15 },
    { x: -10, y: 0 },
  ]);
});
