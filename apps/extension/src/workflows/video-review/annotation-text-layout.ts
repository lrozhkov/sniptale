import { wrapReviewCaptionText } from '../../features/video/review/caption-lines';
import type { ReviewTextAppearance } from '../../features/video/review/annotation-effects/text-appearance';
import type { ReviewAnnotationTextClip } from '../../features/video/review/annotation-effects/types';
import { reviewAnnotationTextFont } from './annotation-text-fonts';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

type Line = { text: string; x: number; width: number };
type TextUnit = Line & { row: number };
type Bounds = { x: number; y: number; width: number; height: number };
type Layout = {
  lines: Line[];
  width: number;
  lineHeight: number;
  ink: Bounds | null;
  units(unit: 'word' | 'grapheme', context: CanvasRenderingContext2D): TextUnit[];
};
const layouts = new WeakMap<
  ReviewAnnotationTextClip,
  { text: string; key: string; layout: Layout }
>();

function textUnits(
  lines: readonly Line[],
  unit: 'word' | 'grapheme',
  measure: (text: string) => number
): TextUnit[] {
  const units: TextUnit[] = [];
  for (const [row, line] of lines.entries()) {
    const pieces =
      unit === 'word'
        ? line.text.split(/(\s+)/u).filter(Boolean)
        : Array.from(graphemes.segment(line.text), ({ segment }) => segment);
    let previous = '';
    let previousWidth = 0;
    let x = line.x;
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

function lineStart(lineWidth: number, blockWidth: number, align: ReviewTextAppearance['align']) {
  if (align === 'left') return -blockWidth / 2;
  if (align === 'right') return blockWidth / 2 - lineWidth;
  return -lineWidth / 2;
}

function union(bounds: Bounds | null, other: Bounds): Bounds {
  if (!bounds) return other;
  const x = Math.min(bounds.x, other.x);
  const y = Math.min(bounds.y, other.y);
  return {
    x,
    y,
    width: Math.max(bounds.x + bounds.width, other.x + other.width) - x,
    height: Math.max(bounds.y + bounds.height, other.y + other.height) - y,
  };
}

/** Paint and the selection overlay measure on the same font, baseline, and wrap plane. */
export function prepareReviewAnnotationTextLayout(
  context: CanvasRenderingContext2D,
  clip: ReviewAnnotationTextClip,
  boxWidth: number,
  fontSize: number,
  appearance: ReviewTextAppearance
) {
  const font = reviewAnnotationTextFont(appearance, fontSize);
  context.font = font;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.letterSpacing = `${appearance.letterSpacing * fontSize}px`;
  return layoutReviewAnnotationText(context, clip, boxWidth, fontSize, appearance, font);
}

/** Text is laid out completely before an animation samples any of its words or graphemes. */
export function layoutReviewAnnotationText(
  context: CanvasRenderingContext2D,
  clip: ReviewAnnotationTextClip,
  boxWidth: number,
  fontSize: number,
  appearance: ReviewTextAppearance,
  font: string
): Layout {
  const spacing = appearance.letterSpacing * fontSize;
  const lineHeight = appearance.lineHeight * fontSize;
  const key = JSON.stringify([boxWidth, font, appearance.align, spacing, lineHeight]);
  const existing = layouts.get(clip);
  if (existing?.text === clip.text && existing.key === key) return existing.layout;

  const measure = (text: string) => context.measureText(text).width;
  const wrapped = wrapReviewCaptionText(clip.text, boxWidth, measure);
  const metrics = wrapped.map((text) => context.measureText(text));
  const blockWidth = Math.max(0, ...metrics.map(({ width }) => width));
  let ink: Bounds | null = null;
  const lines = wrapped.map((text, row) => {
    const {
      width,
      actualBoundingBoxLeft,
      actualBoundingBoxRight,
      actualBoundingBoxAscent,
      actualBoundingBoxDescent,
    } = metrics[row]!;
    const x = lineStart(width, blockWidth, appearance.align);
    if (text.trim()) {
      const left = actualBoundingBoxLeft ?? 0;
      const right = actualBoundingBoxRight ?? width;
      const ascent = actualBoundingBoxAscent ?? fontSize / 2;
      const descent = actualBoundingBoxDescent ?? fontSize / 2;
      ink = union(ink, {
        x: x - left,
        y: (row - (wrapped.length - 1) / 2) * lineHeight - ascent,
        width: left + right,
        height: ascent + descent,
      });
    }
    return { text, width, x };
  });
  const cachedUnits: Partial<Record<'word' | 'grapheme', TextUnit[]>> = {};
  const layout = {
    lines,
    width: blockWidth,
    lineHeight,
    ink,
    units(unit: 'word' | 'grapheme', context: CanvasRenderingContext2D) {
      // A later render can request a different unit after measuring another frame.
      const cached = cachedUnits[unit];
      if (cached) return cached;
      context.save();
      try {
        context.font = font;
        context.letterSpacing = `${spacing}px`;
        const units = textUnits(lines, unit, (text) => context.measureText(text).width);
        cachedUnits[unit] = units;
        return units;
      } finally {
        context.restore();
      }
    },
  } satisfies Layout;
  layouts.set(clip, { text: clip.text, key, layout });
  return layout;
}

/** Shared background extents. Omitting the row selects the background for the whole block. */
export function reviewAnnotationTextBackgroundRect(
  layout: Layout,
  background: ReviewTextAppearance['background'],
  fontSize: number,
  row?: number
): Bounds {
  const line = row === undefined ? undefined : layout.lines[row];
  const paddingX = background.paddingX * fontSize;
  const height =
    (line ? Math.min(layout.lineHeight, fontSize) : layout.lines.length * layout.lineHeight) +
    2 * background.paddingY * fontSize;
  const centerY = row === undefined ? 0 : (row - (layout.lines.length - 1) / 2) * layout.lineHeight;
  return {
    x: (line?.x ?? -layout.width / 2) - paddingX,
    y: centerY - height / 2,
    width: (line?.width ?? layout.width) + 2 * paddingX,
    height,
  };
}

/** Editing geometry includes resting ink, outline and background, with a stable rotation pivot. */
export function reviewAnnotationTextSelectionBounds(
  layout: Layout,
  appearance: ReviewTextAppearance,
  fontSize: number
): Bounds | null {
  const { ink } = layout;
  if (!ink) return null;
  const { outline, background } = appearance;
  const stroke = outline.enabled && outline.opacity > 0 ? (outline.width * fontSize) / 2 : 0;
  let bounds = {
    x: ink.x - stroke,
    y: ink.y - stroke,
    width: ink.width + stroke * 2,
    height: ink.height + stroke * 2,
  };
  if (layout.width <= 0 || background.opacity <= 0) return bounds;
  if (background.mode === 'block')
    return union(bounds, reviewAnnotationTextBackgroundRect(layout, background, fontSize));
  if (background.mode === 'marker')
    for (const [row, line] of layout.lines.entries())
      if (line.width > 0)
        bounds = union(
          bounds,
          reviewAnnotationTextBackgroundRect(layout, background, fontSize, row)
        );
  return bounds;
}
