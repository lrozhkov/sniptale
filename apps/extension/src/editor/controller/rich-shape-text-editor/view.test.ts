// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import type { Canvas } from 'fabric';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { applyRichShapeTextEditorRenderState } from './view';

function createCanvas() {
  const element = document.createElement('canvas');
  Object.defineProperty(element, 'width', { configurable: true, value: 100 });
  Object.defineProperty(element, 'height', { configurable: true, value: 100 });
  element.getBoundingClientRect = vi.fn(() => ({
    bottom: 100,
    height: 100,
    left: 0,
    right: 100,
    top: 0,
    width: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
  return {
    getElement: () => element,
    getHeight: () => 100,
    getWidth: () => 100,
    viewportTransform: null,
  } as unknown as Canvas;
}

function createObject(shape = createDefaultRichShapeObject()) {
  return {
    calcTransformMatrix: () => [1, 0, 0, 1, 0, 0],
    sniptaleRichShape: shape,
    sniptaleType: 'rich-shape',
  } as never;
}

it('applies wrapping, decoration, and top alignment styles', () => {
  const element = document.createElement('textarea');
  const shape = createDefaultRichShapeObject({
    text: {
      ...createDefaultRichShapeObject().text,
      strike: true,
      underline: true,
      verticalAlign: 'top',
      wrap: 'wrap',
    },
  });

  expect(
    applyRichShapeTextEditorRenderState({
      canvas: createCanvas(),
      element,
      object: createObject(shape),
      shape,
    })
  ).toBe(true);

  expect(element.style.textDecoration).toContain('underline');
  expect(element.style.textDecoration).toContain('line-through');
  expect(element.style.whiteSpace).toBe('pre-wrap');
  expect(element.style.paddingTop).toBe('0px');
});

it('applies overflow mode and bottom vertical alignment', () => {
  const element = document.createElement('textarea');
  const shape = createDefaultRichShapeObject({
    frame: { height: 120, left: 0, top: 0, width: 160 },
    text: {
      ...createDefaultRichShapeObject().text,
      fontSize: 10,
      verticalAlign: 'bottom',
      wrap: 'overflow',
    },
  });

  applyRichShapeTextEditorRenderState({
    canvas: createCanvas(),
    element,
    object: createObject(shape),
    shape,
  });

  expect(element.style.overflow).toBe('visible');
  expect(element.style.whiteSpace).toBe('pre');
  expect(Number.parseFloat(element.style.paddingTop)).toBeGreaterThan(0);
});

it('applies clipped wrapping and middle vertical alignment', () => {
  const element = document.createElement('textarea');
  const shape = createDefaultRichShapeObject({
    frame: { height: 100, left: 0, top: 0, width: 160 },
    text: {
      ...createDefaultRichShapeObject().text,
      content: 'Middle',
      fontSize: 12,
      verticalAlign: 'middle',
      wrap: 'clip',
    },
  });

  applyRichShapeTextEditorRenderState({
    canvas: createCanvas(),
    element,
    object: createObject(shape),
    shape,
  });

  expect(element.style.overflow).toBe('auto');
  expect(element.style.whiteSpace).toBe('pre');
  expect(Number.parseFloat(element.style.paddingTop)).toBeGreaterThan(0);
});
