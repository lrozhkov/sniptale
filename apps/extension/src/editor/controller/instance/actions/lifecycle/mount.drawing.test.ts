// @vitest-environment jsdom

import { Rect } from 'fabric';
import { expect, it } from 'vitest';
import { applyBaseInteractionPatch } from '../../../document/objects/interaction-patches';
import { createMountedCanvas } from './mount';

it('configures canonical drawing selection and transform modifiers', () => {
  const canvas = createMountedCanvas(document.createElement('canvas'));

  expect(canvas.selectionKey).toBe('ctrlKey');
  expect(canvas.uniformScaling).toBe(false);
  expect(canvas.uniScaleKey).toBe('shiftKey');
  expect(canvas.centeredKey).toBe('ctrlKey');
  expect(canvas.enablePointerEvents).toBe(true);
  expect(canvas.fireMiddleClick).toBe(false);
  expect(canvas.targetFindTolerance).toBe(5);
  expect(canvas.upperCanvasEl.draggable).toBe(false);

  canvas.dispose();
});

function dispatchPointer(
  canvas: ReturnType<typeof createMountedCanvas>,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  y: number,
  ctrlKey = false
) {
  canvas.upperCanvasEl.dispatchEvent(
    new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y, ctrlKey })
  );
}

function marquee(canvas: ReturnType<typeof createMountedCanvas>, right: number, bottom: number) {
  dispatchPointer(canvas, 'pointerdown', 10, 10);
  dispatchPointer(canvas, 'pointermove', right, bottom);
  dispatchPointer(canvas, 'pointerup', right, bottom);
}

it('marquee selects enclosed layers and excludes intersecting layers and a locked source', async () => {
  const canvas = createMountedCanvas(document.createElement('canvas'));
  document.body.append(canvas.wrapperEl);
  canvas.setDimensions({ width: 600, height: 400 });
  const source = new Rect({
    originX: 'left',
    originY: 'top',
    left: 20,
    top: 20,
    width: 520,
    height: 320,
    sniptaleType: 'source-image',
  });
  applyBaseInteractionPatch(source, { arrowInteraction: null, arrowObject: false, locked: true });
  const enclosed = new Rect({
    originX: 'left',
    originY: 'top',
    left: 30,
    top: 30,
    width: 40,
    height: 40,
    strokeWidth: 0,
  });
  const intersecting = new Rect({
    originX: 'left',
    originY: 'top',
    left: 100,
    top: 60,
    width: 120,
    height: 120,
  });
  const large = new Rect({
    originX: 'left',
    originY: 'top',
    left: 20,
    top: 20,
    width: 500,
    height: 300,
    sniptaleType: 'background',
  });
  canvas.add(source, large, enclosed, intersecting);
  try {
    marquee(canvas, 150, 150);
    expect(canvas.getActiveObjects()).toEqual([enclosed]);
    canvas.discardActiveObject();
    marquee(canvas, 550, 350);
    expect(new Set(canvas.getActiveObjects())).toEqual(new Set([large, enclosed, intersecting]));
    expect(source.selectable).toBe(false);
    canvas.discardActiveObject();
    applyBaseInteractionPatch(source, {
      arrowInteraction: null,
      arrowObject: false,
      locked: false,
    });
    marquee(canvas, 550, 350);
    expect(new Set(canvas.getActiveObjects())).toEqual(
      new Set([source, large, enclosed, intersecting])
    );
  } finally {
    await canvas.dispose();
  }
});

it('uses transformed corners for containment and preserves click and Ctrl add selection', async () => {
  const canvas = createMountedCanvas(document.createElement('canvas'));
  document.body.append(canvas.wrapperEl);
  canvas.setDimensions({ width: 600, height: 400 });
  const rotated = new Rect({
    originX: 'left',
    originY: 'top',
    left: 130,
    top: 80,
    width: 80,
    height: 40,
    angle: 45,
    scaleX: 1.5,
    strokeWidth: 0,
  });
  const separate = new Rect({
    originX: 'left',
    originY: 'top',
    left: 300,
    top: 50,
    width: 40,
    height: 40,
  });
  canvas.add(rotated, separate);
  const originalCorners = rotated.getCoords();
  try {
    marquee(canvas, 200, 200);
    expect(canvas.getActiveObjects()).toEqual([]);
    marquee(canvas, 230, 210);
    expect(canvas.getActiveObjects()).toEqual([rotated]);
    dispatchPointer(canvas, 'pointerdown', 320, 70, true);
    dispatchPointer(canvas, 'pointerup', 320, 70, true);
    expect(new Set(canvas.getActiveObjects())).toEqual(new Set([rotated, separate]));
    rotated.getCoords().forEach((point, index) => {
      expect(point.x).toBeCloseTo(originalCorners[index]!.x, 8);
      expect(point.y).toBeCloseTo(originalCorners[index]!.y, 8);
    });
    canvas.discardActiveObject();
    dispatchPointer(canvas, 'pointerdown', 320, 70);
    dispatchPointer(canvas, 'pointerup', 320, 70);
    expect(canvas.getActiveObjects()).toEqual([separate]);
  } finally {
    await canvas.dispose();
  }
});
