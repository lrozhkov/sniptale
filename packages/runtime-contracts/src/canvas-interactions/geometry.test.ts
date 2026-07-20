import { expect, it } from 'vitest';
import {
  clampCanvasFrameToBounds,
  createBoundedCanvasDragFrame,
  createCanvasFrameAtPoint,
  createCenteredCanvasFrame,
  createCanvasFrameFromPoints,
  createProportionalCanvasFrameFromPoints,
  doesCanvasFrameIntersect,
  getCanvasPointFromClient,
  resizeCanvasFrameFromHandle,
  resolveCanvasPointerDelta,
  translateCanvasFrame,
  translateCanvasPoint,
} from './geometry';

it('resolves pointer deltas and translated geometry in canvas coordinates', () => {
  const delta = resolveCanvasPointerDelta({
    origin: { clientX: 100, clientY: 80 },
    scale: 2,
    target: { clientX: 160, clientY: 120 },
  });

  expect(delta).toEqual({ x: 30, y: 20 });
  expect(translateCanvasFrame({ height: 40, width: 80, x: 10, y: 20 }, delta)).toEqual({
    height: 40,
    width: 80,
    x: 40,
    y: 40,
  });
  expect(translateCanvasPoint({ x: 5, y: 7 }, delta)).toEqual({ x: 35, y: 27 });
});

it('centers inserted frames on canvas points and clamps them inside optional bounds', () => {
  expect(
    createCenteredCanvasFrame({
      point: { x: 120, y: 80 },
      size: { height: 40, width: 80 },
    })
  ).toEqual({ height: 40, width: 80, x: 80, y: 60 });

  expect(
    createCenteredCanvasFrame({
      bounds: { height: 120, width: 160 },
      point: { x: 150, y: 8 },
      size: { height: 40, width: 80 },
    })
  ).toEqual({ height: 40, width: 80, x: 80, y: 0 });
});

it('places and clamps shared canvas insert frames for click and drag adapters', () => {
  const bounds = { height: 100, width: 200 };

  expect(
    createCanvasFrameAtPoint({
      anchor: 'top-left',
      bounds,
      point: { x: 190.8, y: 92.2 },
      round: true,
      size: { height: 30, width: 50 },
    })
  ).toEqual({ height: 30, width: 50, x: 150, y: 70 });
  expect(
    createCanvasFrameAtPoint({
      anchor: 'center',
      bounds,
      point: { x: 10, y: 10 },
      size: { height: 40, width: 80 },
    })
  ).toEqual({ height: 40, width: 80, x: 0, y: 0 });
  expect(
    createBoundedCanvasDragFrame({
      bounds,
      fallbackSize: { height: 8, width: 8 },
      frame: { height: 3, width: 12, x: 120, y: 80 },
      minSize: 8,
      origin: { x: 120, y: 80 },
      round: true,
    })
  ).toEqual({ height: 8, width: 8, x: 116, y: 76 });
  expect(
    clampCanvasFrameToBounds({
      bounds,
      frame: { height: 45.7, width: 240, x: -10, y: 88.8 },
      minSize: 8,
      round: true,
    })
  ).toEqual({ height: 46, width: 200, x: 0, y: 54 });
});

it('resizes frames from directional handles with minimum size anchoring', () => {
  expect(
    resizeCanvasFrameFromHandle({
      delta: { x: 60, y: 70 },
      frame: { height: 100, width: 120, x: 20, y: 30 },
      handle: 'se',
      minSize: 40,
    })
  ).toEqual({ height: 170, width: 180, x: 20, y: 30 });

  expect(
    resizeCanvasFrameFromHandle({
      delta: { x: 200, y: 200 },
      frame: { height: 100, width: 120, x: 20, y: 30 },
      handle: 'nw',
      minSize: 40,
    })
  ).toEqual({ height: 40, width: 40, x: 100, y: 90 });
});

it('creates canvas frames and points from viewport coordinates', () => {
  expect(createCanvasFrameFromPoints({ x: 30, y: 40 }, { x: 10, y: 90 })).toEqual({
    height: 50,
    width: 20,
    x: 10,
    y: 40,
  });
  expect(
    createProportionalCanvasFrameFromPoints({
      aspectRatio: 2,
      first: { x: 10, y: 20 },
      second: { x: 25, y: 45 },
    })
  ).toEqual({ height: 25, width: 50, x: 10, y: 20 });
  expect(
    getCanvasPointFromClient({
      clientX: 50,
      clientY: 70,
      scale: 2,
      stageRect: { left: 10, top: 20 },
    })
  ).toEqual({ x: 20, y: 25 });
  expect(
    doesCanvasFrameIntersect(
      { height: 80, width: 120, x: 280, y: 240 },
      { height: 60, width: 90, x: 340, y: 280 }
    )
  ).toBe(true);
  expect(
    doesCanvasFrameIntersect(
      { height: 80, width: 120, x: 280, y: 240 },
      { height: 60, width: 90, x: 410, y: 280 }
    )
  ).toBe(false);
});
