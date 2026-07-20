import {
  DEFAULT_RICH_SHAPE_STYLE,
  DEFAULT_RICH_SHAPE_TEXT,
  EDITOR_RICH_SHAPE_FAMILY,
  type EditorRichShapeDashStyle,
  type EditorRichShapeHorizontalAlign,
  type EditorRichShapeStyle,
  type EditorRichShapeTextState,
  type EditorRichShapeVerticalAlign,
} from '../../../../features/editor/document/rich-shape';
import { createExcalidrawElementGeometry } from './geometry';
import { measureExcalidrawPoints } from './points';
import type { ExcalidrawElementModel, ExcalidrawMappedElement } from './types';

const TRANSPARENT = 'transparent';
const DEFAULT_FILL_COLOR = '#ffffff';

function mapDashStyle(value: string | null): EditorRichShapeDashStyle {
  switch (value) {
    case null:
    case 'solid':
      return 'solid';
    case 'dashed':
      return 'dash';
    case 'dotted':
      return 'dot';
    default:
      return 'solid';
  }
}

function safeColor(value: string | null, fallback: string): string {
  if (!value || value === TRANSPARENT) {
    return value ?? fallback;
  }
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

function mapHorizontalAlign(value: string | null): EditorRichShapeHorizontalAlign {
  return value === 'left' || value === 'right' ? value : 'center';
}

function mapVerticalAlign(value: string | null): EditorRichShapeVerticalAlign {
  return value === 'top' || value === 'bottom' ? value : 'middle';
}

function createStyle(element: ExcalidrawElementModel): EditorRichShapeStyle {
  const fillColor = safeColor(element.backgroundColor, DEFAULT_FILL_COLOR);
  return {
    ...DEFAULT_RICH_SHAPE_STYLE,
    fill: { type: 'solid', color: fillColor },
    fillTransparency: fillColor === TRANSPARENT ? 1 : 0,
    line: {
      ...DEFAULT_RICH_SHAPE_STYLE.line,
      color: safeColor(element.strokeColor, DEFAULT_RICH_SHAPE_STYLE.line.color),
      width: element.strokeWidth ?? DEFAULT_RICH_SHAPE_STYLE.line.width,
      dashStyle: mapDashStyle(element.strokeStyle),
      beginArrowhead: element.startArrowhead ?? 'none',
      endArrowhead: element.endArrowhead ?? (element.type === 'arrow' ? 'triangle' : 'none'),
    },
    opacity: element.opacity === null ? DEFAULT_RICH_SHAPE_STYLE.opacity : element.opacity / 100,
  };
}

function createText(
  element: ExcalidrawElementModel,
  embeddedText: string | null
): EditorRichShapeTextState | null {
  const content = embeddedText ?? element.text;
  if (!content) {
    return null;
  }

  return {
    ...DEFAULT_RICH_SHAPE_TEXT,
    content,
    fontSize: element.fontSize ?? DEFAULT_RICH_SHAPE_TEXT.fontSize,
    horizontalAlign: mapHorizontalAlign(element.textAlign),
    verticalAlign: mapVerticalAlign(element.verticalAlign),
  };
}

function isLineLike(element: ExcalidrawElementModel): boolean {
  return (
    element.type === 'line' ||
    element.type === 'arrow' ||
    element.type === 'draw' ||
    element.type === 'freedraw'
  );
}

function createBounds(element: ExcalidrawElementModel) {
  if (isLineLike(element) && element.points.length > 0) {
    const { maxX, maxY, minX, minY } = measureExcalidrawPoints(element.points);
    return {
      left: element.x + minX,
      top: element.y + minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }

  const leftOffset = Math.min(0, element.width);
  const topOffset = Math.min(0, element.height);
  return {
    left: element.x + leftOffset,
    top: element.y + topOffset,
    width: Math.max(1, Math.abs(element.width)),
    height: Math.max(1, Math.abs(element.height)),
  };
}

export function mapExcalidrawElement(
  element: ExcalidrawElementModel,
  embeddedText: string | null
): ExcalidrawMappedElement | null {
  const geometry = createExcalidrawElementGeometry(element);
  if (!geometry) {
    return null;
  }
  const lineLike = isLineLike(element);
  const shapeFamily =
    element.type === 'arrow' ? EDITOR_RICH_SHAPE_FAMILY.ARROW : EDITOR_RICH_SHAPE_FAMILY.LINE;
  return {
    element,
    geometry,
    bounds: createBounds(element),
    shapeFamily: lineLike ? shapeFamily : EDITOR_RICH_SHAPE_FAMILY.LIBRARY,
    shapeKind:
      element.type === 'arrow' ? 'line-arrow' : lineLike ? 'line' : 'excalidraw-library-item',
    style: createStyle(element),
    text: createText(element, embeddedText),
  };
}

export function collectExcalidrawContainerText(
  elements: readonly ExcalidrawElementModel[]
): Map<string, string> {
  const textByContainer = new Map<string, string>();
  for (const element of elements) {
    if (element.type === 'text' && element.containerId && element.text) {
      textByContainer.set(element.containerId, element.text);
    }
  }
  return textByContainer;
}
