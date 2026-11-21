import { wrapReviewCaptionText } from '../../features/video/review/caption-lines';
import type { ReviewTextAppearance } from '../../features/video/review/annotation-effects/text-appearance';
import type { ReviewAnnotationTextClip } from '../../features/video/review/annotation-effects/types';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

type Line = { text: string; x: number; width: number };
type TextUnit = Line & { row: number };
type Layout = {
  lines: Line[];
  width: number;
  x: number;
  lineHeight: number;
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

function lineStart(lineWidth: number, boxWidth: number, align: ReviewTextAppearance['align']) {
  if (align === 'left') return -boxWidth / 2;
  if (align === 'right') return boxWidth / 2 - lineWidth;
  return -lineWidth / 2;
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
  const widths = wrapped.map(measure);
  const blockWidth = Math.max(0, ...widths);
  const lines = wrapped.map((text, row) => {
    const width = widths[row] ?? 0;
    return { text, width, x: lineStart(width, boxWidth, appearance.align) };
  });
  const cachedUnits: Partial<Record<'word' | 'grapheme', TextUnit[]>> = {};
  const layout = {
    lines,
    width: blockWidth,
    x: lineStart(blockWidth, boxWidth, appearance.align),
    lineHeight,
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
