import type { VideoCompositionResolvedTextClip } from '../types';
import { drawRoundedRectPath, wrapText } from './shared';

function scaleOverlayLength(value: number, displayScale: number) {
  return value * Math.max(0.2, displayScale);
}

/** One layout for painting and raster capture, including text beyond the authored panel height. */
export function resolveTextCompositionLayout(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedTextClip,
  frame: { x: number; y: number; width: number; height: number },
  displayScale = 1
) {
  const { style } = clip;
  const padding = scaleOverlayLength(style.padding, displayScale);
  const fontSize = scaleOverlayLength(style.fontSize, displayScale);
  const lineHeightPx = fontSize * style.lineHeight;
  const contentWidth = Math.max(scaleOverlayLength(24, displayScale), frame.width - padding * 2);
  const font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  const lines = wrapText(context, clip.text, font, contentWidth);
  return {
    padding,
    fontSize,
    lineHeightPx,
    contentWidth,
    font,
    lines,
    contentHeight: Math.min(frame.height, padding * 2 + lines.length * lineHeightPx),
    anchorX: getTextAnchorX(style.textAlign, frame.x, frame.width, padding),
  };
}

export function drawTextCompositionLayer(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedTextClip,
  x: number,
  y: number,
  width: number,
  height: number,
  displayScale = 1
): void {
  const { style } = clip;
  const layout = resolveTextCompositionLayout(context, clip, { x, y, width, height }, displayScale);
  drawTextPanelChrome(context, clip, x, y, width, layout.contentHeight, displayScale);
  context.font = layout.font;
  context.fillStyle = style.color;
  context.textBaseline = 'top';
  context.textAlign = style.textAlign;
  layout.lines.forEach((line, index) => {
    context.fillText(
      line,
      layout.anchorX,
      y + layout.padding + index * layout.lineHeightPx,
      layout.contentWidth
    );
  });
}

function drawTextPanelChrome(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedTextClip,
  x: number,
  y: number,
  width: number,
  height: number,
  displayScale: number
): void {
  const { style } = clip;
  drawRoundedRectPath(
    context,
    x,
    y,
    width,
    height,
    scaleOverlayLength(style.borderRadius, displayScale)
  );
  context.fillStyle = style.backgroundColor;
  context.fill();
  if (style.borderWidth <= 0) {
    return;
  }

  context.strokeStyle = style.borderColor;
  context.lineWidth = scaleOverlayLength(style.borderWidth, displayScale);
  context.stroke();
}

function getTextAnchorX(
  textAlign: VideoCompositionResolvedTextClip['style']['textAlign'],
  x: number,
  width: number,
  padding: number
) {
  if (textAlign === 'center') {
    return x + width / 2;
  }

  if (textAlign === 'right') {
    return x + width - padding;
  }

  return x + padding;
}
