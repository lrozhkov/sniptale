import { Shadow, type Gradient } from 'fabric';
import type {
  EditorRichShapeDashStyle,
  EditorRichShapeDocumentObject,
  EditorRichShapeEffects,
  EditorRichShapeStyle,
} from '../../../../features/editor/document/rich-shape';
import { hexToRgba, isTransparentColor } from '../../../document/model';
import { createObjectFactoryStrokeDashArray } from '../../stroke-dash';
import { createLinearRichShapeFill, createRadialRichShapeFill } from '../gradient-fill';
import { clampRichShapeOpacity, richShapeTransparencyToOpacity } from '../opacity';

export type RichShapeRenderableStyle = {
  fill: string | Gradient<'linear'> | Gradient<'radial'>;
  stroke: string;
  strokeDashArray?: number[];
  strokeLineCap: CanvasLineCap;
  strokeLineJoin: CanvasLineJoin;
  strokeWidth: number;
  shadow?: Shadow;
};

function resolveFill(style: EditorRichShapeStyle, width: number, height: number) {
  if (style.fill.type === 'gradient') {
    return style.fill.gradientType === 'radial'
      ? createRadialRichShapeFill(style.fill, width, height, style.fillTransparency)
      : createLinearRichShapeFill(style.fill, width, height, style.fillTransparency);
  }

  if (style.fill.type !== 'solid') {
    return 'transparent';
  }

  return hexToRgba(style.fill.color, richShapeTransparencyToOpacity(style.fillTransparency));
}

export function createRichShapeStrokeDashArray(
  dashStyle: EditorRichShapeDashStyle,
  strokeWidth: number
): number[] | undefined {
  return createObjectFactoryStrokeDashArray(dashStyle, strokeWidth);
}

function createRichShapeShadow(effects: EditorRichShapeEffects): Shadow | undefined {
  if (
    !effects.shadow.enabled ||
    effects.shadow.opacity <= 0 ||
    isTransparentColor(effects.shadow.color)
  ) {
    return undefined;
  }

  const angle = (effects.shadow.angle * Math.PI) / 180;
  return new Shadow({
    affectStroke: true,
    blur: Math.max(0, effects.shadow.blur),
    color: hexToRgba(effects.shadow.color, clampRichShapeOpacity(effects.shadow.opacity)),
    offsetX: Math.cos(angle) * effects.shadow.distance,
    offsetY: Math.sin(angle) * effects.shadow.distance,
  });
}

export function resolveRichShapeRenderableStyle(
  shape: EditorRichShapeDocumentObject
): RichShapeRenderableStyle {
  const line = shape.style.line;
  const style: RichShapeRenderableStyle = {
    fill: resolveFill(shape.style, shape.frame.width, shape.frame.height),
    stroke: hexToRgba(line.color, richShapeTransparencyToOpacity(line.transparency)),
    strokeLineCap: line.cap,
    strokeLineJoin: line.join,
    strokeWidth: Math.max(0, line.width),
  };
  const dashArray = createRichShapeStrokeDashArray(line.dashStyle, line.width);
  const shadow = createRichShapeShadow(shape.effects);
  if (dashArray) {
    style.strokeDashArray = dashArray;
  }
  if (shadow) {
    style.shadow = shadow;
  }
  return style;
}
