import {
  colorToRgba,
  resolveBorderPresetVisual,
  resolveBorderShadowVisual,
} from '../../../../features/highlighter/style';
import type { ResolvedBorderPresetVisual } from '../../../../features/highlighter/style';
import { traceRoundedRect, type ViewerFrameProjection } from './canvas';

const FALLBACK_VISUAL: ResolvedBorderPresetVisual = {
  id: 'viewer-fallback',
  opacity: 100,
  strokeColor: '#f97316',
  strokeOpacity: 100,
  strokeWidth: 3,
  strokeStyle: 'solid',
  radius: 0,
  shadow: 0,
  fillColor: '#00000000',
  fillOpacity: 0,
  inheritCustomCss: false,
  customCss: '',
  customCssStyles: {},
  padding: { top: 3, right: 3, bottom: 3, left: 3 },
};

function resolveVisual(projection: ViewerFrameProjection): ResolvedBorderPresetVisual {
  return projection.frame.borderSettings
    ? resolveBorderPresetVisual(projection.frame.borderSettings)
    : FALLBACK_VISUAL;
}

function applyStrokePattern(
  context: CanvasRenderingContext2D,
  style: ResolvedBorderPresetVisual['strokeStyle'],
  width: number
): void {
  context.lineCap = style === 'dotted' ? 'round' : 'butt';
  context.setLineDash(
    style === 'dashed' ? [width * 3, width * 2] : style === 'dotted' ? [0, width * 2] : []
  );
}

function drawFill(
  context: CanvasRenderingContext2D,
  projection: ViewerFrameProjection,
  visual: ResolvedBorderPresetVisual
) {
  if (!projection.surface.fillVisible) return;
  context.save();
  context.fillStyle = colorToRgba(visual.fillColor, visual.fillOpacity);
  context.beginPath();
  traceRoundedRect(context, projection.surface.geometry);
  context.fill();
  context.restore();
}

function drawStroke(
  context: CanvasRenderingContext2D,
  projection: ViewerFrameProjection,
  visual: ResolvedBorderPresetVisual
) {
  if (!projection.surface.strokeVisible) return;
  const { x, y, width, height, radius, strokeWidth } = projection.surface.geometry;
  const halfStroke = strokeWidth / 2;
  const shadow = resolveBorderShadowVisual(visual.shadow, visual.strokeColor).fabric;

  context.save();
  context.lineWidth = strokeWidth;
  context.strokeStyle = colorToRgba(visual.strokeColor, visual.strokeOpacity);
  applyStrokePattern(context, visual.strokeStyle, strokeWidth);
  if (shadow) {
    context.shadowBlur = shadow.blur;
    context.shadowColor = shadow.color;
    context.shadowOffsetX = shadow.offsetX;
    context.shadowOffsetY = shadow.offsetY;
  }
  context.beginPath();
  traceRoundedRect(context, {
    x: x + halfStroke,
    y: y + halfStroke,
    width: Math.max(0, width - strokeWidth),
    height: Math.max(0, height - strokeWidth),
    radius: Math.max(0, radius - halfStroke),
  });
  context.stroke();
  context.restore();
}

export function drawViewerDecorations(
  context: CanvasRenderingContext2D,
  projections: ViewerFrameProjection[]
): void {
  projections.forEach((projection) => {
    const visual = resolveVisual(projection);
    drawFill(context, projection, visual);
    drawStroke(context, projection, visual);
  });
}
