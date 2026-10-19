import { parseColor } from '@sniptale/foundation/color';

/** Returns whether transparent glyphs must cut through their own text background. */
export function isDrawingTextStencil(color: string, backgroundColor: string | null): boolean {
  return Boolean(backgroundColor) && parseColor(color)?.alpha === 0;
}

export const DRAWING_TEXT_HORIZONTAL_PADDING = 12;
export const DRAWING_TEXT_LINE_HEIGHT_FACTOR = 1.25;
export const DRAWING_TEXT_VERTICAL_PADDING = 2;
const TEXT_MEASUREMENT_SAFETY_PX = 4;
const TEXT_BOX_MIN_WIDTH = 80;
const TEXT_BOX_MAX_WIDTH = 640;
const TEXT_BOX_MAX_UNBROKEN_CHARACTERS = 16;
const TEXT_CHARACTER_WIDTH_FACTOR = 0.55;

/** A text line background in unrotated drawing coordinates. */
export type DrawingTextBackgroundRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

/** Returns clockwise corner radii with square joins between adjacent text lines. */
export function resolveDrawingTextBackgroundRadii(
  lines: readonly DrawingTextBackgroundRect[],
  index: number
): [number, number, number, number] {
  const line = lines[index];
  if (!line) return [0, 0, 0, 0];
  const joinRadii = (neighbor: DrawingTextBackgroundRect | undefined, adjacent: boolean) => {
    if (
      !neighbor ||
      !adjacent ||
      neighbor.left >= line.left + line.width ||
      neighbor.left + neighbor.width <= line.left
    )
      return [3, 3] as const;
    return [
      Math.min(3, Math.max(0, neighbor.left - line.left)),
      Math.min(3, Math.max(0, line.left + line.width - neighbor.left - neighbor.width)),
    ] as const;
  };
  const previous = lines[index - 1];
  const next = lines[index + 1];
  const [topLeft, topRight] = joinRadii(
    previous,
    previous !== undefined && Math.abs(previous.top + previous.height - line.top) < 0.01
  );
  const [bottomLeft, bottomRight] = joinRadii(
    next,
    next !== undefined && Math.abs(line.top + line.height - next.top) < 0.01
  );
  return [topLeft, topRight, bottomRight, bottomLeft];
}

export type DrawingTextBackgroundCorner = { x: number; y: number; radius: number };

/** Returns clockwise outer contours without the internal edges between connected lines. */
export function resolveDrawingTextBackgroundContours(
  lines: readonly DrawingTextBackgroundRect[]
): readonly (readonly DrawingTextBackgroundCorner[])[] {
  const runs: number[][] = [];
  lines.forEach((line, index) => {
    const previous = lines[index - 1];
    const connected =
      previous &&
      Math.abs(previous.top + previous.height - line.top) < 0.01 &&
      previous.left < line.left + line.width &&
      line.left < previous.left + previous.width;
    if (connected) runs[runs.length - 1]!.push(index);
    else runs.push([index]);
  });
  return runs.map((run) => {
    const corners: DrawingTextBackgroundCorner[] = [];
    for (const index of run) {
      const line = lines[index]!;
      const radii = resolveDrawingTextBackgroundRadii(lines, index);
      corners.push(
        { x: line.left + line.width, y: line.top, radius: radii[1] },
        { x: line.left + line.width, y: line.top + line.height, radius: radii[2] }
      );
    }
    for (const index of [...run].reverse()) {
      const line = lines[index]!;
      const radii = resolveDrawingTextBackgroundRadii(lines, index);
      corners.push(
        { x: line.left, y: line.top + line.height, radius: radii[3] },
        { x: line.left, y: line.top, radius: radii[0] }
      );
    }
    const distinct = corners.reduce<DrawingTextBackgroundCorner[]>((result, corner) => {
      const previous = result[result.length - 1];
      if (previous?.x === corner.x && previous.y === corner.y)
        previous.radius = Math.max(previous.radius, corner.radius);
      else result.push(corner);
      return result;
    }, []);
    return distinct.filter((corner, index) => {
      if (corner.radius) return true;
      const previous = distinct[(index + distinct.length - 1) % distinct.length]!;
      const next = distinct[(index + 1) % distinct.length]!;
      return !(
        (previous.x === corner.x && next.x === corner.x) ||
        (previous.y === corner.y && next.y === corner.y)
      );
    });
  });
}

/** Traces each rounded outer contour into the caller's current canvas path. */
export function traceDrawingTextBackground(
  context: {
    moveTo: (x: number, y: number) => void;
    arcTo: (
      firstX: number,
      firstY: number,
      secondX: number,
      secondY: number,
      radius: number
    ) => void;
    closePath: () => void;
  },
  lines: readonly DrawingTextBackgroundRect[]
): void {
  for (const contour of resolveDrawingTextBackgroundContours(lines)) {
    const first = contour[0]!;
    const last = contour[contour.length - 1]!;
    const distance = Math.hypot(last.x - first.x, last.y - first.y);
    context.moveTo(
      first.x + ((last.x - first.x) * first.radius) / distance,
      first.y + ((last.y - first.y) * first.radius) / distance
    );
    contour.forEach((corner, index) => {
      const next = contour[(index + 1) % contour.length]!;
      context.arcTo(corner.x, corner.y, next.x, next.y, corner.radius);
    });
    context.closePath();
  }
}

function estimateCharactersWidth(characters: number, fontSize: number): number {
  return characters * fontSize * TEXT_CHARACTER_WIDTH_FACTOR + DRAWING_TEXT_HORIZONTAL_PADDING;
}

function getDrawingTextMinimumWidth(text: string, fontSize: number): number {
  const longestWord = Math.max(1, ...text.split(/\s+/).map((word) => word.length));
  return Math.min(
    TEXT_BOX_MAX_WIDTH,
    Math.max(
      TEXT_BOX_MIN_WIDTH,
      estimateCharactersWidth(Math.min(longestWord, TEXT_BOX_MAX_UNBROKEN_CHARACTERS), fontSize)
    )
  );
}

export function clampDrawingTextWidth(
  text: string,
  fontSize: number,
  width: number,
  maxWidth = TEXT_BOX_MAX_WIDTH
): number {
  const min = Math.min(maxWidth, getDrawingTextMinimumWidth(text, fontSize));
  return Math.max(min, Math.min(maxWidth, width));
}

export function resolveDrawingTextNaturalWidth(
  text: string,
  fontSize: number,
  maxWidth: number
): number {
  const longestParagraph = Math.max(1, ...text.split('\n').map((paragraph) => paragraph.length));
  return clampDrawingTextWidth(
    text,
    fontSize,
    estimateCharactersWidth(longestParagraph, fontSize),
    maxWidth
  );
}

export function resolveDrawingTextMeasuredNaturalWidth(
  text: string,
  fontSize: number,
  maxWidth: number,
  measureLine: (line: string) => number
): number {
  const measured = Math.max(0, ...text.split('\n').map((line) => measureLine(line)));
  return clampDrawingTextWidth(
    text,
    fontSize,
    Math.ceil(measured + DRAWING_TEXT_HORIZONTAL_PADDING + TEXT_MEASUREMENT_SAFETY_PX),
    maxWidth
  );
}

function estimateDrawingTextLineCount(text: string, fontSize: number, width: number): number {
  const charactersPerLine = Math.max(
    1,
    Math.floor((width - DRAWING_TEXT_HORIZONTAL_PADDING) / (fontSize * TEXT_CHARACTER_WIDTH_FACTOR))
  );
  return text.split('\n').reduce((lineCount, paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) return lineCount + 1;
    let lines = 1;
    let occupied = 0;
    words.forEach((word) => {
      if (word.length > charactersPerLine) {
        const wrappedLines = Math.ceil(word.length / charactersPerLine);
        lines += occupied > 0 ? wrappedLines : wrappedLines - 1;
        occupied = word.length % charactersPerLine;
        return;
      }
      const nextLength = occupied === 0 ? word.length : occupied + 1 + word.length;
      if (nextLength > charactersPerLine) {
        lines += 1;
        occupied = word.length;
      } else {
        occupied = nextLength;
      }
    });
    return lineCount + lines;
  }, 0);
}

function measureDrawingTextLineCount(
  text: string,
  width: number,
  measureLine: (line: string) => number
): number {
  const availableWidth = Math.max(1, width - DRAWING_TEXT_HORIZONTAL_PADDING);
  return text.split('\n').reduce((total, paragraph) => {
    if (!paragraph) return total + 1;
    let lineStart = 0;
    let lines = 0;
    while (lineStart < paragraph.length) {
      let fittingEnd = lineStart + 1;
      while (
        fittingEnd <= paragraph.length &&
        measureLine(paragraph.slice(lineStart, fittingEnd)) <= availableWidth
      ) {
        fittingEnd += 1;
      }
      if (fittingEnd > paragraph.length) {
        lines += 1;
        break;
      }
      const candidateEnd = Math.max(lineStart + 1, fittingEnd - 1);
      const candidate = paragraph.slice(lineStart, candidateEnd);
      const whitespace = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('\t'));
      lineStart = whitespace > 0 ? lineStart + whitespace + 1 : candidateEnd;
      while (paragraph[lineStart] === ' ' || paragraph[lineStart] === '\t') lineStart += 1;
      lines += 1;
    }
    return total + Math.max(1, lines);
  }, 0);
}

export function resolveDrawingTextHeight(
  text: string,
  fontSize: number,
  width: number,
  measureLine?: (line: string) => number
): number {
  const lineCount = measureLine
    ? measureDrawingTextLineCount(text, width, measureLine)
    : estimateDrawingTextLineCount(text, fontSize, width);
  return lineCount * fontSize * DRAWING_TEXT_LINE_HEIGHT_FACTOR + DRAWING_TEXT_VERTICAL_PADDING * 2;
}
