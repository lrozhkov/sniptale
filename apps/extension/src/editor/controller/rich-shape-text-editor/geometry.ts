import { Point, type Canvas } from 'fabric';
import { resolveRichShapeTextFrame } from '../../objects/rich-shape/text-frame';
import type { RichShapeGroup } from '../../objects/rich-shape';

export interface RichShapeTextEditorFrame {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface RichShapeTextEditorPlacement {
  height: number;
  left: number;
  top: number;
  transform: string;
  width: number;
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const resolveRichShapeTextEditorFrame = resolveRichShapeTextFrame;

function transformScenePoint(canvas: Canvas, scenePoint: Point): Point {
  const viewportTransform = canvas.viewportTransform;
  return viewportTransform ? scenePoint.transform(viewportTransform) : scenePoint;
}

function projectLocalPoint(options: {
  canvas: Canvas;
  object: RichShapeGroup;
  point: Point;
  scaleX: number;
  scaleY: number;
  viewportLeft: number;
  viewportTop: number;
}): Point {
  const scenePoint = options.point.transform(options.object.calcTransformMatrix());
  const viewportPoint = transformScenePoint(options.canvas, scenePoint);
  return new Point(
    options.viewportLeft + viewportPoint.x * options.scaleX,
    options.viewportTop + viewportPoint.y * options.scaleY
  );
}

export function resolveRichShapeTextEditorPlacement(options: {
  canvas: Canvas;
  frame: RichShapeTextEditorFrame;
  object: RichShapeGroup;
}): RichShapeTextEditorPlacement | null {
  const element = options.canvas.getElement();
  const rect = element.getBoundingClientRect();
  const canvasWidth = positive(options.canvas.getWidth(), element.width || rect.width);
  const canvasHeight = positive(options.canvas.getHeight(), element.height || rect.height);
  const scaleX = positive(rect.width / canvasWidth, 1);
  const scaleY = positive(rect.height / canvasHeight, 1);
  const { height, left, top, width } = options.frame;
  const shapeFrame = options.object.sniptaleRichShape.frame;
  const localLeft = left - shapeFrame.width / 2;
  const localTop = top - shapeFrame.height / 2;
  const project = (x: number, y: number) =>
    projectLocalPoint({
      canvas: options.canvas,
      object: options.object,
      point: new Point(x, y),
      scaleX,
      scaleY,
      viewportLeft: rect.left,
      viewportTop: rect.top,
    });

  const topLeft = project(localLeft, localTop);
  const topRight = project(localLeft + width, localTop);
  const bottomLeft = project(localLeft, localTop + height);
  const a = (topRight.x - topLeft.x) / width;
  const b = (topRight.y - topLeft.y) / width;
  const c = (bottomLeft.x - topLeft.x) / height;
  const d = (bottomLeft.y - topLeft.y) / height;

  return {
    height,
    left: topLeft.x,
    top: topLeft.y,
    transform: `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`,
    width,
  };
}
