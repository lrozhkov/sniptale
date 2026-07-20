import { describe, expect, it } from 'vitest';
import { recognizeFreehandShape } from './recognition';

function rotatePoint(x: number, y: number, angle: number, centerX = 0, centerY = 0) {
  const translatedX = x - centerX;
  const translatedY = y - centerY;
  return {
    x: centerX + translatedX * Math.cos(angle) - translatedY * Math.sin(angle),
    y: centerY + translatedX * Math.sin(angle) + translatedY * Math.cos(angle),
  };
}

function createRotatedRectangleStroke() {
  const baseStroke = [
    { x: 10, y: 8 },
    { x: 74, y: 8 },
    { x: 74, y: 42 },
    { x: 10, y: 42 },
    { x: 10, y: 8 },
  ];
  return baseStroke.map((point) => rotatePoint(point.x, point.y, Math.PI / 6, 42, 25));
}

function createRotatedSquareStroke() {
  const baseStroke = [
    { x: 16, y: 16 },
    { x: 48, y: 16 },
    { x: 48, y: 48 },
    { x: 16, y: 48 },
    { x: 16, y: 16 },
  ];
  return baseStroke.map((point) => rotatePoint(point.x, point.y, Math.PI / 4, 32, 32));
}

function createTriangleStroke() {
  return [
    { x: 8, y: 50 },
    { x: 16, y: 20 },
    { x: 24, y: 4 },
    { x: 48, y: 10 },
    { x: 80, y: 22 },
    { x: 54, y: 36 },
    { x: 24, y: 46 },
    { x: 8, y: 50 },
  ];
}

function createCircleStroke() {
  return [
    { x: 30, y: 0 },
    { x: 48, y: 8 },
    { x: 58, y: 24 },
    { x: 60, y: 44 },
    { x: 48, y: 60 },
    { x: 28, y: 66 },
    { x: 12, y: 60 },
    { x: 0, y: 42 },
    { x: 4, y: 18 },
    { x: 16, y: 4 },
    { x: 30, y: 0 },
  ];
}

function createOvalStroke() {
  return [
    { x: 28, y: 6 },
    { x: 58, y: 2 },
    { x: 92, y: 8 },
    { x: 112, y: 20 },
    { x: 116, y: 34 },
    { x: 100, y: 50 },
    { x: 64, y: 58 },
    { x: 24, y: 54 },
    { x: 6, y: 38 },
    { x: 8, y: 18 },
    { x: 28, y: 6 },
  ];
}

function createArrowStroke() {
  return [
    { x: 0, y: 0 },
    { x: 24, y: 0 },
    { x: 48, y: 2 },
    { x: 72, y: 0 },
    { x: 96, y: 0 },
    { x: 74, y: -18 },
    { x: 96, y: 0 },
    { x: 72, y: 18 },
  ];
}

function createLooseArrowStroke() {
  return [
    { x: 0, y: 0 },
    { x: 18, y: 2 },
    { x: 36, y: -1 },
    { x: 58, y: 3 },
    { x: 82, y: 0 },
    { x: 70, y: -14 },
    { x: 94, y: 0 },
    { x: 72, y: 16 },
  ];
}

function createLineStroke() {
  return [
    { x: 0, y: 0 },
    { x: 20, y: 2 },
    { x: 42, y: 1 },
    { x: 64, y: 2 },
    { x: 88, y: 0 },
  ];
}

function createOpenPolylineStroke() {
  return [
    { x: 0, y: 0 },
    { x: 22, y: 12 },
    { x: 48, y: -2 },
    { x: 76, y: 22 },
    { x: 104, y: 16 },
  ];
}

function createSubtleRectangleStroke() {
  return [
    { x: 2, y: 2 },
    { x: 24, y: 0 },
    { x: 50, y: 4 },
    { x: 76, y: 2 },
    { x: 82, y: 18 },
    { x: 80, y: 42 },
    { x: 74, y: 58 },
    { x: 48, y: 60 },
    { x: 22, y: 58 },
    { x: 6, y: 50 },
    { x: 4, y: 26 },
    { x: 2, y: 2 },
  ];
}

function createSubtleSquareStroke() {
  return [
    { x: 8, y: 8 },
    { x: 28, y: 6 },
    { x: 50, y: 8 },
    { x: 52, y: 30 },
    { x: 50, y: 52 },
    { x: 28, y: 54 },
    { x: 8, y: 52 },
    { x: 6, y: 30 },
    { x: 8, y: 8 },
  ];
}

function createUserArrowStroke() {
  return [
    { x: 2, y: 34 },
    { x: 18, y: 32 },
    { x: 36, y: 28 },
    { x: 54, y: 24 },
    { x: 72, y: 20 },
    { x: 90, y: 16 },
    { x: 106, y: 12 },
    { x: 92, y: 0 },
    { x: 106, y: 12 },
    { x: 88, y: 22 },
  ];
}

function createAmbiguousStroke() {
  return [
    { x: 0, y: 0 },
    { x: 10, y: 8 },
    { x: 18, y: 2 },
    { x: 26, y: 18 },
    { x: 38, y: 10 },
    { x: 48, y: 24 },
    { x: 64, y: 6 },
  ];
}

function registerRoundedRecognitionTest() {
  it('recognizes rounded strokes as circle or ellipse instead of polygonal fits', () => {
    expect(recognizeFreehandShape(createCircleStroke())).toMatchObject({
      center: expect.any(Object),
      confidence: expect.any(Number),
      kind: 'circle',
    });
    expect(recognizeFreehandShape(createOvalStroke())).toMatchObject({
      confidence: expect.any(Number),
      kind: 'ellipse',
    });
  });
}

function registerAngularRecognitionTest() {
  it('recognizes oriented triangles and rectangles with stable metadata', () => {
    expect(recognizeFreehandShape(createTriangleStroke())).toMatchObject({
      confidence: expect.any(Number),
      kind: 'triangle',
      vertices: expect.any(Array),
    });
    expect(recognizeFreehandShape(createRotatedRectangleStroke())).toMatchObject({
      center: expect.any(Object),
      confidence: expect.any(Number),
      kind: 'rectangle',
      rotation: expect.any(Number),
      width: expect.any(Number),
    });
    expect(recognizeFreehandShape(createRotatedSquareStroke())).toMatchObject({
      confidence: expect.any(Number),
      isSquare: true,
      kind: 'rectangle',
    });
  });
}

function registerOpenRecognitionTest() {
  it('recognizes arrows but leaves arbitrary open polylines alone', () => {
    expect(recognizeFreehandShape(createLineStroke())).toMatchObject({
      confidence: expect.any(Number),
      kind: 'line',
    });
    expect(recognizeFreehandShape(createArrowStroke())).toMatchObject({
      confidence: expect.any(Number),
      kind: 'arrow',
      shaft: {
        end: expect.any(Object),
        start: expect.any(Object),
      },
    });
    expect(recognizeFreehandShape(createLooseArrowStroke())).toMatchObject({
      confidence: expect.any(Number),
      kind: 'arrow',
    });
    expect(recognizeFreehandShape(createOpenPolylineStroke())).not.toMatchObject({
      kind: 'arrow',
    });
  });
}

function registerUserStrokeRegressionTest() {
  it('stabilizes user-like rectangles and arrows that currently escape the recognizer', () => {
    expect(recognizeFreehandShape(createSubtleRectangleStroke())).toMatchObject({
      confidence: expect.any(Number),
      kind: 'rectangle',
    });
    expect(recognizeFreehandShape(createSubtleSquareStroke())).toMatchObject({
      confidence: expect.any(Number),
      isSquare: true,
      kind: 'rectangle',
    });
    expect(recognizeFreehandShape(createUserArrowStroke())).toMatchObject({
      confidence: expect.any(Number),
      kind: 'arrow',
    });
  });
}

function registerAmbiguousRecognitionTest() {
  it('returns null for ambiguous scribbles instead of over-snapping them', () => {
    expect(recognizeFreehandShape(createAmbiguousStroke())).toBeNull();
    expect(
      recognizeFreehandShape([
        { x: 0, y: 0 },
        { x: 3, y: 2 },
      ])
    ).toBeNull();
  });
}

describe('editor-controller freehand recognition seam', () => {
  registerRoundedRecognitionTest();
  registerAngularRecognitionTest();
  registerOpenRecognitionTest();
  registerUserStrokeRegressionTest();
  registerAmbiguousRecognitionTest();
});
