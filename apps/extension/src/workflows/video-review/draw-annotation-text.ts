import {
  legacyReviewTextAppearance,
  reviewTextCssColor,
  type ReviewTextAppearance,
} from '../../features/video/review/annotation-effects/text-appearance';
import { reviewAnnotationTextFont } from './annotation-text-fonts';
import { layoutReviewAnnotationText } from './annotation-text-layout';
import {
  reviewTextRevealUnit,
  sampleReviewAnnotationText,
  sampleReviewTextReveal,
} from '../../features/video/review/annotation-effects/text-animation';
import type { ReviewAnnotationTextClip } from '../../features/video/review/annotation-effects/types';

type Size = { width: number; height: number };

/** Conservative bounds for visible glyphs in the rotated text box's own coordinates. */
function localViewport(
  plane: Size,
  x: number,
  y: number,
  angle: number,
  scaleX: number,
  scaleY: number
) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = plane.width / 2 - x;
  const dy = plane.height / 2 - y;
  const centerX = (dx * cos + dy * sin) / scaleX;
  const centerY = (dy * cos - dx * sin) / scaleY;
  const radiusX = (plane.width * Math.abs(cos) + plane.height * Math.abs(sin)) / (2 * scaleX);
  const radiusY = (plane.height * Math.abs(cos) + plane.width * Math.abs(sin)) / (2 * scaleY);
  return {
    left: centerX - radiusX,
    top: centerY - radiusY,
    right: centerX + radiusX,
    bottom: centerY + radiusY,
  };
}

function shineColor(color: string, strength: number) {
  const target = [255, 212, 124];
  const channels = target.map((channel, index) => {
    const original = Number.parseInt(color.slice(1 + index * 2, 3 + index * 2), 16);
    return Math.round(original + (channel - original) * strength);
  });
  return `rgb(${channels.join(' ')})`;
}

/** Renders the same authored frame to the CPU output or a GPU overlay texture. */
export function drawReviewAnnotationText(
  context: CanvasRenderingContext2D,
  clip: ReviewAnnotationTextClip,
  time: number,
  plane: Size,
  output: Size
) {
  const sample = sampleReviewAnnotationText(clip, time);
  if (!sample || !clip.text.trim()) return;
  const { motion, reveal } = sample;
  const { transform } = clip;
  const width = transform.width * plane.width;
  const height = transform.height * plane.height;
  const fontSize = clip.fontSize * plane.height;
  const appearance = clip.appearance ?? legacyReviewTextAppearance;
  const x = (transform.x + transform.width / 2) * plane.width + motion.x * width;
  const y = (transform.y + transform.height / 2) * plane.height + motion.y * height;
  const angle = transform.rotation + motion.rotation;
  const viewport = localViewport(plane, x, y, angle, motion.scaleX, motion.scaleY);
  context.save();
  try {
    context.scale(output.width / plane.width, output.height / plane.height);
    context.translate(x, y);
    context.rotate(angle);
    context.scale(motion.scaleX, motion.scaleY);
    const font = reviewAnnotationTextFont(appearance, fontSize);
    context.font = font;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.shadowColor = 'transparent';
    context.letterSpacing = `${appearance.letterSpacing * fontSize}px`;
    const { outline, background } = appearance;
    const stroke = outline.enabled && outline.width > 0 && outline.opacity > 0;
    if (stroke) {
      context.lineWidth = fontSize * outline.width;
      context.strokeStyle = reviewTextCssColor(outline.color, outline.opacity);
    }
    const layout = layoutReviewAnnotationText(context, clip, width, fontSize, appearance, font);
    const { lines, lineHeight } = layout;
    const firstLine = -((lines.length - 1) * lineHeight) / 2;
    const unit = reveal ? reviewTextRevealUnit(reveal.transition) : null;
    const parts =
      unit && reveal
        ? layout.units(unit, context).map((part, index, units) => ({
            ...part,
            state: sampleReviewTextReveal(reveal, index, units.length),
          }))
        : null;
    if (motion.wipe < 1) {
      const vertical = reveal?.transition.preset === 'rise';
      const extentX = clip.appearance ? background.paddingX * fontSize : 0;
      const extentY = clip.appearance ? background.paddingY * fontSize : 0;
      const maskHeight = Math.max(height, lines.length * lineHeight + extentY * 2);
      const maskWidth = width + fontSize * 0.12 + extentX * 2;
      context.beginPath();
      context.rect(
        -maskWidth / 2,
        -maskHeight / 2,
        maskWidth * (vertical ? 1 : motion.wipe),
        maskHeight * (vertical ? motion.wipe : 1)
      );
      context.clip();
    }
    if (background.mode !== 'none' && background.opacity > 0) {
      const rows = parts ? new Map<number, number>() : null;
      for (const part of parts ?? []) {
        rows?.set(part.row, Math.max(rows.get(part.row) ?? 0, part.state.opacity));
      }
      paintTextBackground(context, appearance, layout, fontSize, motion.opacity, rows, viewport);
    }
    context.fillStyle = clip.color;
    if (motion.shine > 0) {
      const centre = (motion.shinePosition - 0.5) * width * 1.4;
      const radius = width * 0.22;
      const shine = context.createLinearGradient(centre - radius, 0, centre + radius, 0);
      shine.addColorStop(0, clip.color);
      shine.addColorStop(0.5, shineColor(clip.color, motion.shine));
      shine.addColorStop(1, clip.color);
      context.fillStyle = shine;
    }
    const { shadow } = appearance;
    const shadowColor =
      shadow.enabled && shadow.opacity > 0
        ? reviewTextCssColor(shadow.color, shadow.opacity)
        : 'transparent';
    const shadowExtent =
      shadowColor === 'transparent'
        ? 0
        : Math.max(Math.abs(shadow.x), Math.abs(shadow.y)) + shadow.blur * 4;
    if (shadowExtent > 0) {
      const dx = shadow.x * fontSize * motion.scaleX;
      const dy = shadow.y * fontSize * motion.scaleY;
      const scaleX = output.width / plane.width;
      const scaleY = output.height / plane.height;
      // Canvas shadows operate in destination pixels and do not follow the current transform.
      context.shadowOffsetX = (dx * Math.cos(angle) - dy * Math.sin(angle)) * scaleX;
      context.shadowOffsetY = (dx * Math.sin(angle) + dy * Math.cos(angle)) * scaleY;
      context.shadowBlur =
        shadow.blur * fontSize * (motion.scaleX * scaleX + motion.scaleY * scaleY);
    }
    const paint = (
      text: string,
      x: number,
      y: number,
      advance: number,
      opacity: number,
      blur: number
    ) => {
      const padding =
        fontSize * (2 + shadowExtent + (4 * blur) / Math.min(motion.scaleX, motion.scaleY));
      if (
        opacity <= 0 ||
        y + padding < viewport.top ||
        y - padding > viewport.bottom ||
        x + advance + padding < viewport.left ||
        x - padding > viewport.right
      )
        return;
      context.globalAlpha = opacity;
      context.filter =
        blur > 0 ? `blur(${blur * fontSize * (output.height / plane.height)}px)` : 'none';
      if (stroke) {
        context.shadowColor = 'transparent';
        context.strokeText(text, x, y);
      }
      context.shadowColor = shadowColor;
      context.fillText(text, x, y);
    };
    if (parts) {
      for (const { text, row, x, width, state } of parts) {
        paint(
          text,
          x,
          firstLine + row * lineHeight + state.y * fontSize,
          width,
          motion.opacity * state.opacity,
          motion.blur + state.blur
        );
      }
      return;
    }
    context.letterSpacing = `${(appearance.letterSpacing + motion.tracking) * fontSize}px`;
    for (const [index, line] of lines.entries()) {
      const advance = motion.tracking ? context.measureText(line.text).width : line.width;
      const x =
        line.x +
        (line.width - advance) *
          (appearance.align === 'center' ? 0.5 : Number(appearance.align === 'right'));
      paint(line.text, x, firstLine + index * lineHeight, advance, motion.opacity, motion.blur);
    }
  } finally {
    context.restore();
  }
}

function paintTextBackground(
  context: CanvasRenderingContext2D,
  { background }: ReviewTextAppearance,
  { lines, width, x, lineHeight }: ReturnType<typeof layoutReviewAnnotationText>,
  fontSize: number,
  opacity: number,
  visibleRows: ReadonlyMap<number, number> | null,
  viewport: ReturnType<typeof localViewport>
) {
  if (width <= 0 || opacity <= 0) return;
  const paddingX = background.paddingX * fontSize;
  const paddingY = background.paddingY * fontSize;
  context.fillStyle = background.color;
  context.filter = 'none';
  if (background.mode === 'block') {
    context.globalAlpha = opacity * background.opacity;
    const height = lines.length * lineHeight + paddingY * 2;
    context.beginPath();
    context.roundRect(
      x - paddingX,
      -height / 2,
      width + paddingX * 2,
      height,
      Math.min(background.radius * fontSize, height / 2, width / 2 + paddingX)
    );
    context.fill();
    return;
  }
  const lineBox = Math.min(lineHeight, fontSize);
  const markerHeight = lineBox + 2 * paddingY;
  const first = -((lines.length - 1) * lineHeight + markerHeight) / 2;
  for (const [row, line] of lines.entries()) {
    const rowOpacity = visibleRows ? (visibleRows.get(row) ?? 0) : 1;
    const y = first + row * lineHeight;
    if (
      rowOpacity <= 0 ||
      line.width <= 0 ||
      y > viewport.bottom ||
      y + markerHeight < viewport.top
    )
      continue;
    context.globalAlpha = opacity * rowOpacity * background.opacity;
    context.fillRect(line.x - paddingX, y, line.width + paddingX * 2, markerHeight);
  }
}

/** Both backends composite viewport text and package graphics in authored stacking order. */
export function reviewViewportAnnotationLayers<T extends { instance: { order: number } }>(
  packages: readonly T[],
  clips: readonly ReviewAnnotationTextClip[],
  time: number
) {
  return [
    ...packages.map((frame) => ({ kind: 'package' as const, order: frame.instance.order, frame })),
    ...reviewActiveAnnotationText(clips, time).map((clip) => ({
      kind: 'text' as const,
      order: clip.order,
      clip,
    })),
  ].sort((a, b) => a.order - b.order);
}

export function reviewActiveAnnotationText(
  clips: readonly ReviewAnnotationTextClip[],
  time: number
) {
  return clips
    .filter((clip) => clip.enabled && !!clip.text.trim() && time >= clip.start && time < clip.end)
    .sort((a, b) => a.order - b.order);
}
