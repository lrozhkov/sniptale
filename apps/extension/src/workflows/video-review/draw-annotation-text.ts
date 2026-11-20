import { wrapReviewCaptionText } from '../../features/video/review/caption-lines';
import {
  reviewTextRevealUnit,
  sampleReviewAnnotationText,
  sampleReviewTextReveal,
} from '../../features/video/review/annotation-effects/text-animation';
import type { ReviewAnnotationTextClip } from '../../features/video/review/annotation-effects/types';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

type Size = { width: number; height: number };

type TextUnit = { text: string; row: number; x: number; width: number };
type TextLayout = {
  text: string;
  width: number;
  fontSize: number;
  lines: string[];
  widths: number[];
  word?: TextUnit[];
  grapheme?: TextUnit[];
};
const layouts = new WeakMap<ReviewAnnotationTextClip, TextLayout>();

export function layoutReviewAnnotationTextUnits(
  lines: readonly string[],
  unit: 'word' | 'grapheme',
  measure: (text: string) => number
): TextUnit[] {
  const units: TextUnit[] = [];
  for (const [row, line] of lines.entries()) {
    const pieces =
      unit === 'word'
        ? line.split(/(\s+)/u).filter(Boolean)
        : Array.from(graphemes.segment(line), ({ segment }) => segment);
    let previous = '';
    let previousWidth = 0;
    let x = -measure(line) / 2;
    for (const text of pieces) {
      const width = measure(text);
      if (previous) x += measure(previous + text) - previousWidth - width;
      if (text.trim()) units.push({ text, row, x, width });
      x += width;
      previous = text;
      previousWidth = width;
    }
  }
  return units;
}

function textLayout(
  clip: ReviewAnnotationTextClip,
  width: number,
  fontSize: number,
  measure: (text: string) => number
): TextLayout {
  const existing = layouts.get(clip);
  if (existing?.width === width && existing.fontSize === fontSize && existing.text === clip.text)
    return existing;
  const lines = wrapReviewCaptionText(clip.text, width, measure);
  const layout = { text: clip.text, width, fontSize, lines, widths: lines.map(measure) };
  layouts.set(clip, layout);
  return layout;
}

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
  const lineHeight = fontSize * 1.2;
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
    context.font = `600 ${fontSize}px Arial, sans-serif`;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.lineWidth = fontSize * 0.06;
    context.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    context.letterSpacing = '0px';
    const measure = (text: string) => context.measureText(text).width;
    const layout = textLayout(clip, width, fontSize, measure);
    const { lines } = layout;
    const firstLine = -((lines.length - 1) * lineHeight) / 2;
    if (motion.wipe < 1) {
      const vertical = reveal?.transition.preset === 'rise';
      const maskHeight = Math.max(height, lines.length * lineHeight);
      const maskWidth = width + fontSize * 0.12;
      context.beginPath();
      context.rect(
        -maskWidth / 2,
        -maskHeight / 2,
        maskWidth * (vertical ? 1 : motion.wipe),
        maskHeight * (vertical ? motion.wipe : 1)
      );
      context.clip();
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
    const paint = (
      text: string,
      x: number,
      y: number,
      advance: number,
      opacity: number,
      blur: number
    ) => {
      const padding = fontSize * (2 + (4 * blur) / Math.min(motion.scaleX, motion.scaleY));
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
      context.strokeText(text, x, y);
      context.fillText(text, x, y);
    };
    const unit = reveal ? reviewTextRevealUnit(reveal.transition) : null;
    if (unit && reveal) {
      const units = (layout[unit] ??= layoutReviewAnnotationTextUnits(lines, unit, measure));
      for (const [index, part] of units.entries()) {
        const state = sampleReviewTextReveal(reveal, index, units.length);
        paint(
          part.text,
          part.x,
          firstLine + part.row * lineHeight + state.y * fontSize,
          part.width,
          motion.opacity * state.opacity,
          motion.blur + state.blur
        );
      }
      return;
    }
    context.letterSpacing = `${motion.tracking * fontSize}px`;
    for (const [index, line] of lines.entries()) {
      const advance = motion.tracking ? measure(line) : (layout.widths[index] ?? 0);
      paint(
        line,
        -advance / 2,
        firstLine + index * lineHeight,
        advance,
        motion.opacity,
        motion.blur
      );
    }
  } finally {
    context.restore();
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
