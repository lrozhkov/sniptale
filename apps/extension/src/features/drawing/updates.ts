import {
  type DrawingArrowDesign,
  type DrawingCreatableShapeKind,
  type DrawingFontFamily,
  type DrawingObject,
  type DrawingShapeObject,
} from './model';
import { resolveDrawingTextHeight } from './text-layout';

export type DrawingTextMeasurementPort = (args: {
  fontFamily: DrawingFontFamily;
  fontSize: number;
  line: string;
}) => number;

export type SelectedQuickDrawingObject =
  | Extract<DrawingObject, { kind: 'pencil' | 'marker' | 'arrow' | 'text' }>
  | DrawingShapeObject
  | null;

export type DrawingQuickToolUpdate = {
  color?: string;
  backgroundColor?: string | null;
  fillColor?: string | null;
  dynamicWidth?: boolean;
  design?: DrawingArrowDesign;
  fontSize?: number;
  fontFamily?: DrawingFontFamily;
  kind?: DrawingCreatableShapeKind;
  opacity?: number;
  width?: number;
};

function resolveUpdatedTextBounds(
  selected: Extract<DrawingObject, { kind: 'text' }>,
  fontFamily: DrawingFontFamily,
  fontSize: number,
  typographyChanged: boolean,
  measureText?: DrawingTextMeasurementPort
) {
  if (!typographyChanged) return selected.bounds;
  return {
    ...selected.bounds,
    height: Math.ceil(
      resolveDrawingTextHeight(
        selected.text,
        fontSize,
        selected.bounds.width,
        measureText ? (line) => measureText({ fontFamily, fontSize, line }) : undefined
      )
    ),
  };
}

function resolveUpdatedText(
  selected: Extract<DrawingObject, { kind: 'text' }>,
  update: DrawingQuickToolUpdate,
  measureText?: DrawingTextMeasurementPort
): Extract<DrawingObject, { kind: 'text' }> {
  const fontFamily = update.fontFamily ?? selected.fontFamily ?? 'sans';
  const fontSize = update.fontSize ?? selected.fontSize;
  return {
    ...selected,
    backgroundColor:
      update.backgroundColor === undefined ? selected.backgroundColor : update.backgroundColor,
    bounds: resolveUpdatedTextBounds(
      selected,
      fontFamily,
      fontSize,
      update.fontFamily !== undefined || update.fontSize !== undefined,
      measureText
    ),
    color: update.color ?? selected.color,
    fontFamily,
    fontSize,
  };
}

function resolveUpdatedShape(
  selected: DrawingShapeObject,
  update: DrawingQuickToolUpdate
): DrawingShapeObject {
  const next = {
    ...selected,
    color: update.color ?? selected.color,
    fillColor: update.fillColor === undefined ? (selected.fillColor ?? null) : update.fillColor,
    width: update.width ?? selected.width,
  };
  if (update.kind === 'rectangle') return { ...next, kind: 'rectangle' };
  if (update.kind === 'ellipse') return { ...next, kind: 'ellipse' };
  if (update.kind === 'triangle') return { ...next, kind: 'triangle' };
  return next;
}

export function resolveUpdatedQuickObject(
  selected: Exclude<SelectedQuickDrawingObject, null>,
  update: DrawingQuickToolUpdate,
  options: { measureText?: DrawingTextMeasurementPort } = {}
): Exclude<SelectedQuickDrawingObject, null> {
  if (selected.kind === 'pencil')
    return {
      ...selected,
      color: update.color ?? selected.color,
      width: update.width ?? selected.width,
    };
  if (selected.kind === 'marker')
    return {
      ...selected,
      color: update.color ?? selected.color,
      opacity: update.opacity ?? selected.opacity,
      width: update.width ?? selected.width,
    };
  if (selected.kind === 'arrow')
    return {
      ...selected,
      color: update.color ?? selected.color,
      design: update.design ?? selected.design ?? 'standard',
      dynamicWidth: update.dynamicWidth ?? selected.dynamicWidth,
      width: update.width ?? selected.width,
    };
  if (selected.kind === 'text') return resolveUpdatedText(selected, update, options.measureText);
  return resolveUpdatedShape(selected, update);
}
