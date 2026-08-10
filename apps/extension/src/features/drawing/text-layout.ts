export const DRAWING_TEXT_HORIZONTAL_PADDING = 12;
export const DRAWING_TEXT_LINE_HEIGHT_FACTOR = 1.25;
export const DRAWING_TEXT_VERTICAL_PADDING = 2;
const TEXT_MEASUREMENT_SAFETY_PX = 4;
const TEXT_BOX_MIN_WIDTH = 80;
const TEXT_BOX_MAX_WIDTH = 640;
const TEXT_BOX_MAX_UNBROKEN_CHARACTERS = 16;
const TEXT_CHARACTER_WIDTH_FACTOR = 0.55;

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
