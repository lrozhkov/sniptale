import type { VideoCompositionResolvedTextClip } from '../types';
import { drawRoundedRectPath, wrapText } from './shared';

function scaleOverlayLength(value: number, displayScale: number) {
  return value * Math.max(0.2, displayScale);
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
  const padding = scaleOverlayLength(style.padding, displayScale);
  const fontSize = scaleOverlayLength(style.fontSize, displayScale);
  const lineHeightPx = fontSize * style.lineHeight;
  const contentWidth = Math.max(scaleOverlayLength(24, displayScale), width - padding * 2);
  const lines = wrapText(
    context,
    clip.text,
    `${style.fontWeight} ${fontSize}px ${style.fontFamily}`,
    contentWidth
  );
  const contentHeight = Math.min(height, padding * 2 + lines.length * lineHeightPx);

  drawTextPanelChrome(context, clip, x, y, width, contentHeight, displayScale);
  context.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  context.fillStyle = style.color;
  context.textBaseline = 'top';
  context.textAlign = style.textAlign;

  const anchorX = getTextAnchorX(style.textAlign, x, width, padding);
  lines.forEach((line, index) => {
    context.fillText(line, anchorX, y + padding + index * lineHeightPx, contentWidth);
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
