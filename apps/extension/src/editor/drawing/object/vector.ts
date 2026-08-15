import { Ellipse, Path, Point, Polygon, Rect, Textbox, Triangle, type FabricObject } from 'fabric';
import {
  buildDrawingArrowOutline,
  buildDrawingFreehandArrowLines,
  buildDrawingStrokeOutline,
  DRAWING_TEXT_HORIZONTAL_PADDING,
  getDrawingBoundsCenter,
  getDrawingEllipsePoints,
  getDrawingObjectBounds,
  getDrawingShapePoints,
  DRAWING_TEXT_LINE_HEIGHT_FACTOR,
  DRAWING_TEXT_VERTICAL_PADDING,
  resolveDrawingTextMeasuredNaturalWidth,
  resolveDrawingTextHeight,
  resolveDrawingTextFontFamily,
  type DrawingObject,
  type DrawingPoint,
} from '../../../features/drawing/public';
import { createObjectLabel } from '../../document/model';
import { stageEditorDrawingObject, writeEditorDrawingObject } from './metadata';

type TextboxVisualAdapter = {
  getLineLeftOffset: Textbox['_getLineLeftOffset'];
  getTopOffset: Textbox['_getTopOffset'];
  wrapText: Textbox['_wrapText'];
};

const textboxVisualAdapters = new WeakMap<Textbox, TextboxVisualAdapter>();

function pointsPath(points: readonly DrawingPoint[], close: boolean): string {
  const first = points[0];
  if (!first) return 'M 0 0';
  return `M ${first.x} ${first.y} ${points
    .slice(1)
    .map((point) => `L ${point.x} ${point.y}`)
    .join(' ')}${close ? ' Z' : ''}`;
}

function decorate(object: FabricObject, drawing: DrawingObject, labelIndex: number): FabricObject {
  object.sniptaleId = drawing.id;
  object.sniptaleType =
    drawing.kind === 'rectangle' ||
    drawing.kind === 'ellipse' ||
    drawing.kind === 'triangle' ||
    drawing.kind === 'parallelogram'
      ? 'shape'
      : drawing.kind;
  object.sniptaleRole = 'annotation';
  object.sniptaleLabel = createObjectLabel(object.sniptaleType, labelIndex);
  writeEditorDrawingObject(object, drawing);
  return object;
}

function createFreehandObject(
  drawing: Extract<DrawingObject, { kind: 'pencil' | 'marker' }>,
  preview: boolean
): FabricObject {
  if (preview) {
    return new Path(pointsPath(drawing.samples, false), {
      fill: null,
      opacity: drawing.kind === 'marker' ? drawing.opacity : 1,
      originX: 'left',
      originY: 'top',
      stroke: drawing.color,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      strokeWidth: drawing.width,
    });
  }
  const outline = buildDrawingStrokeOutline(drawing.samples, drawing.width, {
    dynamicWidth: drawing.kind === 'pencil',
    smoothingLevel: 10,
  });
  return new Path(pointsPath(outline, true), {
    fill: drawing.color,
    opacity: drawing.kind === 'marker' ? drawing.opacity : 1,
    originX: 'left',
    originY: 'top',
    stroke: null,
  });
}

function createArrowObject(drawing: Extract<DrawingObject, { kind: 'arrow' }>): FabricObject {
  if (drawing.design === 'freehand') {
    return new Path(
      buildDrawingFreehandArrowLines(drawing)
        .map((line) => pointsPath(line, false))
        .join(' '),
      {
        fill: null,
        originX: 'left',
        originY: 'top',
        stroke: drawing.color,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        strokeWidth: Math.max(2, drawing.width * 0.32),
      }
    );
  }
  return new Path(pointsPath(buildDrawingArrowOutline(drawing), true), {
    fill: drawing.color,
    originX: 'left',
    originY: 'top',
    stroke: null,
  });
}

function createShapeObject(
  drawing: Extract<DrawingObject, { kind: 'rectangle' | 'ellipse' | 'triangle' | 'parallelogram' }>
): FabricObject {
  const options = {
    fill: drawing.fillColor ?? 'transparent',
    left: drawing.bounds.x,
    originX: 'left' as const,
    originY: 'top' as const,
    stroke: drawing.color,
    strokeUniform: true,
    strokeWidth: drawing.width,
    top: drawing.bounds.y,
  };
  if (drawing.kind === 'rectangle') {
    return new Rect({ ...options, height: drawing.bounds.height, width: drawing.bounds.width });
  }
  if (drawing.kind === 'ellipse' && !drawing.skewX) {
    return new Ellipse({
      ...options,
      left: drawing.bounds.x + drawing.bounds.width / 2,
      originX: 'center',
      originY: 'center',
      rx: drawing.bounds.width / 2,
      ry: drawing.bounds.height / 2,
      top: drawing.bounds.y + drawing.bounds.height / 2,
    });
  }
  if (drawing.kind === 'triangle' && !drawing.skewX) {
    return new Triangle({ ...options, height: drawing.bounds.height, width: drawing.bounds.width });
  }
  const points =
    drawing.kind === 'ellipse' ? getDrawingEllipsePoints(drawing) : getDrawingShapePoints(drawing);
  return new Polygon(points, {
    fill: drawing.fillColor ?? 'transparent',
    stroke: drawing.color,
    strokeUniform: true,
    strokeWidth: drawing.width,
  });
}

function createTextObject(drawing: Extract<DrawingObject, { kind: 'text' }>): FabricObject {
  const textbox = new Textbox(drawing.text, {
    fill: drawing.color,
    fontFamily: resolveDrawingTextFontFamily(drawing.fontFamily),
    fontSize: drawing.fontSize,
    lineHeight: DRAWING_TEXT_LINE_HEIGHT_FACTOR,
    objectCaching: false,
    left: drawing.bounds.x,
    originX: 'left',
    originY: 'top',
    top: drawing.bounds.y,
    textBackgroundColor: drawing.backgroundColor ?? '',
    width: Math.max(40, drawing.bounds.width),
  });
  applyEditorDrawingTextVisuals(textbox);
  return textbox;
}

export function renderEditorDrawingTextBackground(
  textbox: Textbox,
  context: Pick<CanvasRenderingContext2D, 'beginPath' | 'fill' | 'fillStyle' | 'roundRect'>
): void {
  if (!textbox.textBackgroundColor) return;
  const previousFill = context.fillStyle;
  context.fillStyle = textbox.textBackgroundColor;
  const left = textbox._getLeftOffset();
  let top = textbox._getTopOffset();
  textbox._textLines.forEach((_line, index) => {
    const height = textbox.getHeightOfLine(index);
    const width = Math.min(textbox.width, Math.max(12, textbox.getLineWidth(index) + 12));
    context.beginPath();
    context.roundRect(left, top, width, height, 3);
    context.fill();
    top += height;
  });
  context.fillStyle = previousFill;
}

export function applyEditorDrawingTextVisuals(textbox: Textbox): void {
  if (!textboxVisualAdapters.has(textbox)) {
    const adapter = {
      getLineLeftOffset: textbox._getLineLeftOffset.bind(textbox),
      getTopOffset: textbox._getTopOffset.bind(textbox),
      wrapText: textbox._wrapText.bind(textbox),
    };
    textboxVisualAdapters.set(textbox, adapter);
    textbox._getLineLeftOffset = (lineIndex) =>
      adapter.getLineLeftOffset(lineIndex) + DRAWING_TEXT_HORIZONTAL_PADDING / 2;
    textbox._getTopOffset = () => adapter.getTopOffset() + DRAWING_TEXT_VERTICAL_PADDING;
    textbox._wrapText = (lines, width) =>
      adapter.wrapText(lines, Math.max(1, width - DRAWING_TEXT_HORIZONTAL_PADDING));
  }
  textbox.set({ lineHeight: DRAWING_TEXT_LINE_HEIGHT_FACTOR });
  textbox._renderTextLinesBackground = (context) =>
    renderEditorDrawingTextBackground(textbox, context);
  textbox.initDimensions();
  synchronizeEditorDrawingTextLayout(textbox);
}

export function synchronizeEditorDrawingTextLayout(textbox: Textbox): boolean {
  const maxWidth = Math.max(80, textbox.sniptaleDrawingTextMaxWidth ?? 640);
  const context =
    typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (context) context.font = `${textbox.fontSize}px ${textbox.fontFamily}`;
  const measure = (line: string) =>
    context?.measureText(line).width ?? line.length * textbox.fontSize * 0.55;
  const width = textbox.sniptaleDrawingTextAutoWidth
    ? resolveDrawingTextMeasuredNaturalWidth(
        textbox.text ?? '',
        textbox.fontSize,
        maxWidth,
        measure
      )
    : textbox.width;
  const widthChanged = Math.abs(textbox.width - width) >= 0.5;
  if (widthChanged) {
    textbox.set({ width });
    textbox.initDimensions();
  }
  const height = resolveDrawingTextHeight(textbox.text ?? '', textbox.fontSize, width, measure);
  const heightChanged = Math.abs(textbox.height - height) >= 0.5;
  if (!widthChanged && !heightChanged) {
    return false;
  }
  if (heightChanged) textbox.set({ height });
  textbox.setCoords();
  textbox.canvas?.requestRenderAll();
  return true;
}

export function createEditorDrawingFabricObject(
  drawing: Exclude<DrawingObject, { kind: 'blur' }>,
  labelIndex: number,
  options: { preview?: boolean } = {}
): FabricObject {
  const object =
    drawing.kind === 'pencil' || drawing.kind === 'marker'
      ? createFreehandObject(drawing, options.preview === true)
      : drawing.kind === 'arrow'
        ? createArrowObject(drawing)
        : drawing.kind === 'text'
          ? createTextObject(drawing)
          : createShapeObject(drawing);
  const normalizedDrawing =
    drawing.kind === 'text'
      ? (() => {
          const height = Math.max(1, object.height);
          const width = Math.max(40, object.width);
          const center = getDrawingBoundsCenter(drawing.bounds);
          return {
            ...drawing,
            bounds: {
              ...drawing.bounds,
              height,
              width,
              ...(drawing.rotation ? { x: center.x - width / 2, y: center.y - height / 2 } : {}),
            },
          };
        })()
      : drawing;
  if (normalizedDrawing.kind !== 'arrow' && normalizedDrawing.rotation) {
    const center = getDrawingBoundsCenter(getDrawingObjectBounds(normalizedDrawing));
    object.set({
      angle: normalizedDrawing.rotation ?? 0,
      left: center.x,
      originX: 'center',
      originY: 'center',
      top: center.y,
    });
    object.setPositionByOrigin(new Point(center.x, center.y), 'center', 'center');
  } else if (normalizedDrawing.kind === 'text') {
    object.set({ left: normalizedDrawing.bounds.x, top: normalizedDrawing.bounds.y });
  }
  return decorate(object, normalizedDrawing, labelIndex);
}

export function updateEditorDrawingPathDraft(
  current: FabricObject,
  drawing: Extract<DrawingObject, { kind: 'pencil' | 'marker' | 'arrow' }>,
  options: { preview: boolean }
): boolean {
  if (!(current instanceof Path)) return false;
  const geometry = createEditorDrawingFabricObject(drawing, 1, options);
  if (!(geometry instanceof Path)) return false;
  current.set({
    fill: geometry.fill,
    height: geometry.height,
    left: geometry.left,
    opacity: geometry.opacity,
    originX: geometry.originX,
    originY: geometry.originY,
    path: geometry.path,
    pathOffset: geometry.pathOffset,
    stroke: geometry.stroke,
    strokeLineCap: geometry.strokeLineCap,
    strokeLineJoin: geometry.strokeLineJoin,
    strokeWidth: geometry.strokeWidth,
    top: geometry.top,
    width: geometry.width,
  });
  if (options.preview) stageEditorDrawingObject(current, drawing);
  else writeEditorDrawingObject(current, drawing);
  current.setCoords();
  return true;
}

export function updateEditorDrawingShapeDraft(
  current: FabricObject,
  drawing: Extract<DrawingObject, { kind: 'rectangle' | 'ellipse' | 'triangle' | 'parallelogram' }>
): boolean {
  const geometry = createEditorDrawingFabricObject(drawing, 1);
  const sameKind =
    (current instanceof Rect && geometry instanceof Rect) ||
    (current instanceof Ellipse && geometry instanceof Ellipse) ||
    (current instanceof Triangle && geometry instanceof Triangle) ||
    (current instanceof Polygon && geometry instanceof Polygon);
  if (!sameKind) return false;

  current.set({
    angle: geometry.angle,
    height: geometry.height,
    left: geometry.left,
    originX: geometry.originX,
    originY: geometry.originY,
    scaleX: geometry.scaleX,
    scaleY: geometry.scaleY,
    top: geometry.top,
    width: geometry.width,
  });
  if (current instanceof Ellipse && geometry instanceof Ellipse) {
    current.set({ rx: geometry.rx, ry: geometry.ry });
  }
  if (current instanceof Polygon && geometry instanceof Polygon) {
    current.set({ pathOffset: geometry.pathOffset, points: geometry.points });
  }
  stageEditorDrawingObject(current, drawing);
  current.setCoords();
  return true;
}

export function replaceEditorDrawingFabricGeometry(
  current: FabricObject,
  drawing: Exclude<DrawingObject, { kind: 'blur' }>
): FabricObject {
  const next = createEditorDrawingFabricObject(drawing, 1);
  if (current.sniptaleLabel !== undefined) next.sniptaleLabel = current.sniptaleLabel;
  if (current.sniptaleLocked !== undefined) next.sniptaleLocked = current.sniptaleLocked;
  next.visible = current.visible;
  next.setCoords();
  return next;
}
