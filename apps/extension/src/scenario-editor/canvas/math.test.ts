import { expect, it } from 'vitest';
import { createScenarioTextElement } from '../../features/scenario/project/v3';
import { createElementFrameMovePatch } from './drag';
import { createEndpointMovePatch } from './endpoint';
import { createImageContentPanPatch, createImageContentZoomPatch } from './image-content';
import { createElementKeyboardNudgeFrame } from './keyboard';
import type { ScenarioCanvasMagnetContext } from './magnet';
import { createElementFrameResizePatch } from './resize';
import {
  snapScenarioCanvasMoveFrame,
  snapScenarioCanvasPoint,
  snapScenarioCanvasResizeFrame,
} from './snapping';
import {
  createScenarioCanvasMarqueeFrame,
  doesScenarioFrameIntersect,
  getScenarioCanvasPointFromClient,
  resolveScenarioCanvasFitScale,
  stepScenarioCanvasZoom,
} from './viewport';
import { resolveScenarioCanvasGuides } from './guides';

it('keeps drag math independent from React event handling', () => {
  expect(
    createElementFrameMovePatch({
      frame: { height: 20, width: 40, x: 8, y: 10 },
      originClientX: 0,
      originClientY: 0,
      scale: 2,
      targetClientX: 10,
      targetClientY: 12,
    })
  ).toEqual({ height: 20, width: 40, x: 13, y: 16 });
  expect(
    createElementFrameMovePatch({
      frame: { height: 20, width: 40, x: 8, y: 10 },
      originClientX: 0,
      originClientY: 0,
      scale: 0,
      targetClientX: 10,
      targetClientY: 12,
    })
  ).toEqual({ height: 20, width: 40, x: 18, y: 22 });
});

it('keeps resize and keyboard math independent from React event handling', () => {
  const element = createScenarioTextElement({
    frame: { height: 80, width: 260, x: 100, y: 120 },
  });

  expect(
    createElementFrameResizePatch({
      frame: { height: 40, width: 50, x: 100, y: 100 },
      handle: 'nw',
      originClientX: 0,
      originClientY: 0,
      scale: 1,
      targetClientX: 10,
      targetClientY: 10,
    })
  ).toEqual({ height: 30, width: 40, x: 110, y: 110 });
  expect(createElementKeyboardNudgeFrame({ element, key: 'ArrowLeft', large: true })).toEqual(
    expect.objectContaining({ x: 90, y: 120 })
  );
});

it('keeps endpoint and image-content math independent from React event handling', () => {
  expect(
    createEndpointMovePatch({
      end: { x: 10, y: 20 },
      handle: 'end',
      originClientX: 0,
      originClientY: 0,
      scale: 2,
      start: { x: 1, y: 2 },
      targetClientX: 8,
      targetClientY: 10,
    })
  ).toEqual({ end: { x: 14, y: 25 } });
  expect(
    createImageContentPanPatch({
      originClientX: 0,
      originClientY: 0,
      scale: 2,
      snapshot: { scale: 1, x: 3, y: 4 },
      targetClientX: 8,
      targetClientY: 10,
    })
  ).toEqual({ contentTransform: { scale: 1, x: 7, y: 9 } });
  expect(
    createImageContentZoomPatch({
      direction: 'out',
      snapshot: { scale: 0.15, x: 3, y: 4 },
    })
  ).toEqual({ contentTransform: { scale: 0.1, x: 3, y: 4 } });
});

it('fits the slide into the viewport and fills available space', () => {
  expect(
    resolveScenarioCanvasFitScale({
      canvas: { height: 900, width: 1440 },
      padding: 48,
      viewport: { height: 720, width: 960 },
    })
  ).toBe(0.6);
  expect(
    resolveScenarioCanvasFitScale({
      canvas: { height: 900, width: 1440 },
      padding: 48,
      viewport: { height: 1400, width: 2000 },
    })
  ).toBe(1.32);
  expect(
    resolveScenarioCanvasFitScale({
      canvas: { height: 900, width: 1600 },
      insets: { bottom: 176, left: 336, right: 384, top: 96 },
      padding: 48,
      viewport: { height: 1080, width: 1920 },
    })
  ).toBe(0.69);
  expect(stepScenarioCanvasZoom(0.21, 'out')).toBe(0.2);
  expect(stepScenarioCanvasZoom(3.98, 'in')).toBe(4);
});

it('converts pointer coordinates and marquee frames through the active scale', () => {
  const point = getScenarioCanvasPointFromClient({
    clientX: 330,
    clientY: 260,
    scale: 0.5,
    stageRect: { left: 30, top: 20 },
  });

  expect(point).toEqual({ x: 600, y: 480 });
  expect(createScenarioCanvasMarqueeFrame({ x: 300, y: 260 }, point)).toEqual({
    height: 220,
    width: 300,
    x: 300,
    y: 260,
  });
  expect(
    doesScenarioFrameIntersect(
      { height: 80, width: 120, x: 280, y: 240 },
      { height: 60, width: 90, x: 340, y: 280 }
    )
  ).toBe(true);
});

it('snaps move and resize frames to the presentation grid', () => {
  expect(snapScenarioCanvasMoveFrame({ height: 80, width: 160, x: 47, y: 81 }, 32)).toEqual({
    height: 80,
    width: 160,
    x: 32,
    y: 96,
  });
  expect(
    snapScenarioCanvasResizeFrame({
      frame: { height: 103, width: 147, x: 64, y: 64 },
      gridSize: 32,
      handle: 'se',
    })
  ).toEqual({ height: 96, width: 160, x: 64, y: 64 });
  expect(snapScenarioCanvasPoint({ x: 17, y: 47 }, 0)).toEqual({ x: 17, y: 47 });
  expect(
    snapScenarioCanvasResizeFrame({
      frame: { height: 103, width: 147, x: 47, y: 47 },
      gridSize: 32,
      handle: 'nw',
    })
  ).toEqual({ height: 118, width: 162, x: 32, y: 32 });
});

it('uses magnet alignment before falling back to grid snapping', () => {
  const magnetContext = createMagnetContext();

  expect(
    createElementFrameMovePatch({
      frame: { height: 30, width: 50, x: 100, y: 100 },
      magnetContext,
      originClientX: 0,
      originClientY: 0,
      scale: 1,
      snapGridSize: 32,
      targetClientX: 9,
      targetClientY: 0,
    })
  ).toEqual({ height: 30, width: 50, x: 110, y: 100 });
  expect(
    createElementFrameMovePatch({
      frame: { height: 30, width: 50, x: 100, y: 200 },
      magnetContext,
      originClientX: 0,
      originClientY: 0,
      scale: 1,
      snapGridSize: 32,
      targetClientX: 30,
      targetClientY: 30,
    })
  ).toEqual({ height: 30, width: 50, x: 128, y: 224 });
});

it('uses magnet alignment for resize handles and line endpoints', () => {
  const magnetContext = createMagnetContext();

  expect(
    createElementFrameResizePatch({
      frame: { height: 30, width: 50, x: 100, y: 100 },
      handle: 'se',
      magnetContext,
      originClientX: 0,
      originClientY: 0,
      scale: 1,
      snapGridSize: 32,
      targetClientX: 9,
      targetClientY: 0,
    })
  ).toEqual({ height: 30, width: 60, x: 100, y: 100 });
  expect(
    createEndpointMovePatch({
      end: { x: 100, y: 100 },
      handle: 'end',
      magnetContext,
      originClientX: 0,
      originClientY: 0,
      scale: 1,
      snapGridSize: 32,
      start: { x: 20, y: 20 },
      targetClientX: 59,
      targetClientY: 0,
    })
  ).toEqual({ end: { x: 160, y: 100 } });
});

it('resolves alignment guides against slide and neighboring element edges', () => {
  const guides = resolveScenarioCanvasGuides({
    activeElementId: 'active',
    frame: { height: 80, width: 120, x: 196, y: 220 },
    renderedElements: [
      {
        box: { centerX: 400, centerY: 260, height: 80, width: 120, x: 340, y: 220 },
        element: createScenarioTextElement({ frame: { height: 80, width: 120, x: 340, y: 220 } }),
        kind: 'text',
        selected: false,
      },
    ],
    slide: { height: 900, width: 1440 },
  });

  expect(guides).toContainEqual({ axis: 'horizontal', position: 220 });
  expect(guides).toContainEqual({ axis: 'horizontal', position: 260 });
});

function createMagnetContext(): ScenarioCanvasMagnetContext {
  const sibling = {
    ...createScenarioTextElement({
      frame: { height: 60, width: 120, x: 160, y: 100 },
    }),
    id: 'sibling',
  };

  return {
    activeElementId: 'active',
    elements: [sibling],
    slide: { height: 480, width: 640 },
  };
}
