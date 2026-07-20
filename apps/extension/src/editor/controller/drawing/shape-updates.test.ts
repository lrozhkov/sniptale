import { Ellipse, Point, Polygon, Rect } from 'fabric';
import { expect, it } from 'vitest';
import {
  createProportionalRectDraftBounds,
  createRectDraftBounds,
  updateShapeOrCropDrawSessionObject,
} from './shape-updates';

const defaultShapeSettings = { strokeWidth: 4 } as never;

function runRectangleSuite() {
  it('updates rectangle sessions and ignores non-rect objects', () => {
    const rectangle = new Rect({ left: 10, top: 20, width: 1, height: 1 });

    expect(
      updateShapeOrCropDrawSessionObject(
        {
          object: rectangle,
          start: { x: 10, y: 20 },
          tool: 'rectangle',
        } as never,
        new Point(25, 45),
        defaultShapeSettings
      )
    ).toBeNull();
    expect(rectangle.left).toBe(12);
    expect(rectangle.top).toBe(22);
    expect(rectangle.width).toBe(11);
    expect(rectangle.height).toBe(21);

    expect(
      updateShapeOrCropDrawSessionObject(
        {
          object: new Ellipse({ rx: 1, ry: 1 }),
          start: { x: 10, y: 20 },
          tool: 'rectangle',
        } as never,
        new Point(25, 45),
        defaultShapeSettings
      )
    ).toBeNull();
  });
}

it('creates freeform and proportional crop draft bounds', () => {
  expect(createRectDraftBounds(new Point(25, 45), new Point(10, 20))).toEqual({
    left: 10,
    top: 20,
    width: 15,
    height: 25,
  });
  expect(createProportionalRectDraftBounds(new Point(10, 20), new Point(25, 45), 2)).toEqual({
    height: 25,
    left: 10,
    top: 20,
    width: 50,
  });
  expect(createProportionalRectDraftBounds(new Point(10, 20), new Point(-5, 5), 0)).toEqual({
    height: 15,
    left: -5,
    top: 5,
    width: 15,
  });
  expect(createProportionalRectDraftBounds(new Point(30, 40), new Point(10, 90), 0.5)).toEqual({
    height: 50,
    left: 5,
    top: 40,
    width: 25,
  });
});

it('updates crop sessions backed by rectangle guide objects', () => {
  const cropGuide = new Rect({ left: 10, top: 20, width: 1, height: 1 });

  expect(
    updateShapeOrCropDrawSessionObject(
      {
        object: cropGuide,
        start: { x: 10, y: 20 },
        tool: 'crop',
      } as never,
      new Point(25, 45),
      defaultShapeSettings
    )
  ).toEqual({
    left: 10,
    top: 20,
    width: 15,
    height: 25,
  });
  expect(cropGuide.left).toBe(10);
  expect(cropGuide.top).toBe(20);
});

it('ignores non-rect crop session objects', () => {
  expect(
    updateShapeOrCropDrawSessionObject(
      {
        object: new Ellipse({ rx: 1, ry: 1 }),
        start: { x: 10, y: 20 },
        tool: 'crop',
      } as never,
      new Point(25, 45),
      defaultShapeSettings
    )
  ).toBeNull();
});

function runNegativeDragSuite() {
  it('normalizes negative drag directions for both rectangle-backed tools', () => {
    const rectangle = new Rect({ left: 0, top: 0, width: 1, height: 1 });
    const cropGuide = new Rect({ left: 0, top: 0, width: 1, height: 1 });

    expect(
      updateShapeOrCropDrawSessionObject(
        {
          object: rectangle,
          start: { x: 30, y: 40 },
          tool: 'rectangle',
        } as never,
        new Point(10, 20),
        defaultShapeSettings
      )
    ).toBeNull();
    expect(
      updateShapeOrCropDrawSessionObject(
        {
          object: cropGuide,
          start: { x: 30, y: 40 },
          tool: 'crop',
        } as never,
        new Point(10, 20),
        defaultShapeSettings
      )
    ).toEqual({
      height: 20,
      left: 10,
      top: 20,
      width: 20,
    });
    expect(rectangle.left).toBe(12);
    expect(rectangle.top).toBe(22);
    expect(rectangle.width).toBe(16);
    expect(rectangle.height).toBe(16);
  });
}

function runEllipseSuite() {
  it('updates ellipse sessions and ignores non-ellipse objects', () => {
    const ellipse = new Ellipse({
      left: 12,
      top: 18,
      rx: 1,
      ry: 1,
      originX: 'center',
      originY: 'center',
    });

    expect(
      updateShapeOrCropDrawSessionObject(
        {
          object: ellipse,
          start: { x: 12, y: 18 },
          tool: 'ellipse',
        } as never,
        new Point(30, 42),
        defaultShapeSettings
      )
    ).toBeNull();
    expect(ellipse.rx).toBe(9);
    expect(ellipse.ry).toBe(12);

    expect(
      updateShapeOrCropDrawSessionObject(
        {
          object: new Rect({ width: 2, height: 2 }),
          start: { x: 12, y: 18 },
          tool: 'ellipse',
        } as never,
        new Point(30, 42),
        defaultShapeSettings
      )
    ).toBeNull();
  });
}

function runDiamondSuite() {
  it('updates diamond sessions and ignores non-polygon objects', () => {
    const diamond = new Polygon(
      [
        { x: 0, y: -1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
      ],
      { left: 12, top: 18, originX: 'center', originY: 'center' }
    );

    expect(
      updateShapeOrCropDrawSessionObject(
        {
          object: diamond,
          start: { x: 12, y: 18 },
          tool: 'diamond',
        } as never,
        new Point(32, 44),
        defaultShapeSettings
      )
    ).toBeNull();
    expect(diamond.points).toEqual([
      { x: 0, y: -13 },
      { x: 10, y: 0 },
      { x: 0, y: 13 },
      { x: -10, y: 0 },
    ]);

    expect(
      updateShapeOrCropDrawSessionObject(
        {
          object: new Rect({ width: 2, height: 2 }),
          start: { x: 12, y: 18 },
          tool: 'diamond',
        } as never,
        new Point(32, 44),
        defaultShapeSettings
      )
    ).toBeNull();
  });
}

function runDefaultSuite() {
  it('returns null for unsupported draw-session tools', () => {
    ['arrow', 'line', 'text', 'blur'].forEach((tool) => {
      expectUnsupportedToolUpdate(tool);
    });
  });
}

function expectUnsupportedToolUpdate(tool: string) {
  expect(
    updateShapeOrCropDrawSessionObject(
      {
        object: new Rect({ width: 2, height: 2 }),
        start: { x: 12, y: 18 },
        tool,
      } as never,
      new Point(32, 44),
      defaultShapeSettings
    )
  ).toBeNull();
}

runRectangleSuite();
runNegativeDragSuite();
runEllipseSuite();
runDiamondSuite();
runDefaultSuite();
