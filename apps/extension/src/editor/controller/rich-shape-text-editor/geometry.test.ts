// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import type { Canvas } from 'fabric';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { resolveRichShapeTextEditorFrame, resolveRichShapeTextEditorPlacement } from './geometry';
import type { RichShapeGroup } from '../../objects/rich-shape';

function createCanvasMock(options: {
  rect: { height: number; left: number; top: number; width: number };
  canvasSize?: { height: number; width: number };
  elementSize?: { height: number; width: number };
  viewportTransform?: [number, number, number, number, number, number] | null;
}) {
  const element = document.createElement('canvas');
  Object.defineProperty(element, 'width', {
    configurable: true,
    value: options.elementSize?.width ?? 200,
  });
  Object.defineProperty(element, 'height', {
    configurable: true,
    value: options.elementSize?.height ?? 150,
  });
  element.getBoundingClientRect = vi.fn(() => ({
    ...options.rect,
    bottom: options.rect.top + options.rect.height,
    right: options.rect.left + options.rect.width,
    x: options.rect.left,
    y: options.rect.top,
    toJSON: () => ({}),
  }));

  return {
    getElement: () => element,
    getHeight: () => options.canvasSize?.height ?? 150,
    getWidth: () => options.canvasSize?.width ?? 200,
    viewportTransform: options.viewportTransform ?? null,
  } as unknown as Canvas;
}

function createObjectMock(matrix: [number, number, number, number, number, number]) {
  return {
    calcTransformMatrix: () => matrix,
    sniptaleRichShape: createDefaultRichShapeObject(),
    sniptaleType: 'rich-shape',
  } as unknown as RichShapeGroup;
}

it('resolves the inset content frame from the authoritative rich shape model', () => {
  expect(
    resolveRichShapeTextEditorFrame(
      createDefaultRichShapeObject({
        frame: { height: 90, left: 0, top: 0, width: 140 },
        text: {
          ...createDefaultRichShapeObject().text,
          insets: { bottom: 7, left: 11, right: 13, top: 5 },
        },
      })
    )
  ).toEqual({
    height: 78,
    left: 11,
    top: 5,
    width: 116,
  });
});

it('maps the content frame through canvas zoom and viewport pan', () => {
  const canvas = createCanvasMock({
    rect: { height: 300, left: 100, top: 200, width: 400 },
    viewportTransform: [1, 0, 0, 1, 5, 7],
  });
  const placement = resolveRichShapeTextEditorPlacement({
    canvas,
    frame: { height: 40, left: 8, top: 8, width: 100 },
    object: createObjectMock([1, 0, 0, 1, 10, 20]),
  });

  expect(placement).toEqual({
    height: 40,
    left: 145,
    top: 269,
    transform: 'matrix(2, 0, 0, 2, 0, 0)',
    width: 100,
  });
});

it('keeps representative object rotation in the CSS transform matrix', () => {
  const placement = resolveRichShapeTextEditorPlacement({
    canvas: createCanvasMock({ rect: { height: 150, left: 0, top: 0, width: 200 } }),
    frame: { height: 10, left: 0, top: 0, width: 20 },
    object: createObjectMock([0, 1, -1, 0, 100, 50]),
  });

  expect(placement).toEqual({
    height: 10,
    left: 100.5,
    top: 49.5,
    transform: 'matrix(0, 1, -1, 0, 0, 0)',
    width: 20,
  });
});

it('falls back from invalid canvas dimensions to element dimensions', () => {
  const placement = resolveRichShapeTextEditorPlacement({
    canvas: createCanvasMock({
      canvasSize: { height: 0, width: 0 },
      elementSize: { height: 100, width: 200 },
      rect: { height: 100, left: 3, top: 5, width: 200 },
    }),
    frame: { height: 20, left: 0, top: 0, width: 40 },
    object: createObjectMock([1, 0, 0, 1, 0, 0]),
  });

  expect(placement).toEqual({
    height: 20,
    left: 2.5,
    top: 4.5,
    transform: 'matrix(1, 0, 0, 1, 0, 0)',
    width: 40,
  });
});
