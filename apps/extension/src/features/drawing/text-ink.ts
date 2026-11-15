import {
  DRAWING_TEXT_HORIZONTAL_PADDING,
  DRAWING_TEXT_LINE_HEIGHT_FACTOR,
  type DrawingTextBackgroundRect,
} from './text-layout';

export const DRAWING_TEXT_INK_PADDING = 6;

/** Font measurements at the actual paint size. Optional bounds permit a readable fallback. */
export type DrawingTextMetrics = {
  width: number;
  actualBoundingBoxLeft?: number;
  actualBoundingBoxRight?: number;
  actualBoundingBoxAscent?: number;
  actualBoundingBoxDescent?: number;
  fontBoundingBoxAscent?: number;
  fontBoundingBoxDescent?: number;
};
export type DrawingTextMeasure = (text: string) => DrawingTextMetrics;

/** Native CSS tab-size: 8, measured from the start of each visual line. */
export function resolveDrawingTextTabAdvance(left: number, spaceWidth: number): number {
  const stop = Math.max(1, spaceWidth * 8);
  return stop - (left % stop);
}

export function resolveDrawingTextRuns(text: string, measure: DrawingTextMeasure) {
  let left = 0;
  const parts = text.split('\t');
  const space = parts.length > 1 ? measure(' ').width : 0;
  return parts.map((part, index) => {
    const metrics = measure(part);
    const run = { text: part, left, metrics };
    left += metrics.width;
    if (index < parts.length - 1) left += resolveDrawingTextTabAdvance(left, space);
    return run;
  });
}

/** Keeps raw tabs while matching native textarea and DOM tab stops. */
export function measureDrawingTextWithTabs(
  text: string,
  measure: DrawingTextMeasure
): DrawingTextMetrics {
  if (!text.includes('\t')) return measure(text);
  const runs = resolveDrawingTextRuns(text, measure);
  const first = runs[0]!.metrics;
  return {
    ...(first.fontBoundingBoxAscent === undefined
      ? {}
      : { fontBoundingBoxAscent: first.fontBoundingBoxAscent }),
    ...(first.fontBoundingBoxDescent === undefined
      ? {}
      : { fontBoundingBoxDescent: first.fontBoundingBoxDescent }),
    width: runs.at(-1)!.left + runs.at(-1)!.metrics.width,
    actualBoundingBoxLeft: Math.max(
      ...runs.map((run) => (run.metrics.actualBoundingBoxLeft ?? 0) - run.left)
    ),
    actualBoundingBoxRight: Math.max(
      ...runs.map((run) => run.left + (run.metrics.actualBoundingBoxRight ?? run.metrics.width))
    ),
    actualBoundingBoxAscent: Math.max(
      ...runs.map((run) => run.metrics.actualBoundingBoxAscent ?? 0)
    ),
    actualBoundingBoxDescent: Math.max(
      ...runs.map((run) => run.metrics.actualBoundingBoxDescent ?? 0)
    ),
  };
}

export type DrawingTextInkLayout = {
  width: number;
  height: number;
  logicalWidth: number;
  originX: number;
  firstBaseline: number;
  lineHeight: number;
  fontAscent: number;
  fontDescent: number;
  inkLeftBearing: number;
  inkRightOverhang: number;
  inkAscent: number;
  inkDescent: number;
  lines: string[];
  backgrounds: DrawingTextBackgroundRect[];
};

type LineInk = {
  row: number;
  left: number;
  width: number;
  ascent: number;
  descent: number;
  advance: number;
};

function splitLongWord(
  word: string,
  available: number,
  measure: (text: string) => number
): string[] {
  const characters = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word),
    (part) => part.segment
  );
  const result: string[] = [];
  let start = 0;
  while (start < characters.length) {
    let low = start + 1;
    let high = characters.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (measure(characters.slice(start, middle).join('')) <= available) low = middle;
      else high = middle - 1;
    }
    result.push(characters.slice(start, low).join(''));
    start = low;
  }
  return result;
}

/** Wraps without deleting source spaces or breaking a grapheme. Spaces hang at a row end. */
export function wrapDrawingTextLines(
  text: string,
  available: number,
  measure: (text: string) => number
): string[] {
  const result: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const token of paragraph.match(/[^ \t]+|[ \t]+/gu) ?? []) {
      if (/^[ \t]+$/u.test(token) || measure(line + token) <= available) {
        line += token;
        continue;
      }
      if (line) {
        result.push(line);
        line = '';
      }
      if (measure(token) <= available) {
        line = token;
        continue;
      }
      const pieces = splitLongWord(token, Math.max(1, available), measure);
      for (const piece of pieces.slice(0, -1)) result.push(piece);
      line = pieces.at(-1) ?? '';
    }
    result.push(line);
  }
  return result;
}

function readLineInk(
  lines: readonly string[],
  fontSize: number,
  measure: DrawingTextMeasure
): LineInk[] {
  return lines.flatMap((text, row) => {
    if (!text.trim()) return [];
    const metrics = measure(text.trimEnd());
    const left = -(metrics.actualBoundingBoxLeft ?? 0);
    const ascent = metrics.actualBoundingBoxAscent ?? fontSize * 0.8;
    const descent = metrics.actualBoundingBoxDescent ?? fontSize * 0.2;
    return [
      {
        row,
        left,
        width: (metrics.actualBoundingBoxRight ?? metrics.width) - left,
        ascent,
        descent,
        advance: metrics.width,
      },
    ];
  });
}

/** Unions padded row cells into disjoint bands so translucent fill is painted once. */
function lineBackgrounds(
  lines: readonly LineInk[],
  inset: number,
  firstCellTop: number,
  lineHeight: number,
  padding: number
): DrawingTextBackgroundRect[] {
  const events = lines
    .flatMap((line) => {
      const top = firstCellTop + line.row * lineHeight - padding;
      const width = line.advance + inset * 2;
      return [
        { y: top, width, change: 1 },
        { y: top + lineHeight + padding * 2, width, change: -1 },
      ];
    })
    .sort((a, b) => a.y - b.y);
  const active = new Map<number, number>();
  const result: DrawingTextBackgroundRect[] = [];
  let previousY = events[0]?.y ?? 0;
  for (const event of events) {
    if (event.y > previousY && active.size) {
      const width = Math.max(...active.keys());
      const previous = result.at(-1);
      if (previous?.width === width && previous.top + previous.height === previousY)
        previous.height += event.y - previousY;
      else result.push({ left: 0, top: previousY, width, height: event.y - previousY });
    }
    const count = (active.get(event.width) ?? 0) + event.change;
    if (count) active.set(event.width, count);
    else active.delete(event.width);
    previousY = event.y;
  }
  return result;
}

/** Resolves one renderer-neutral ink box, row background path, and baseline grid. */
export function resolveDrawingTextInkLayout(args: {
  text: string;
  fontSize: number;
  wrapWidth: number;
  autoWidth?: boolean;
  editing?: boolean;
  measure: DrawingTextMeasure;
}): DrawingTextInkLayout {
  const { text, fontSize, measure } = args;
  const padding = DRAWING_TEXT_INK_PADDING;
  const natural = text
    .split(/\r?\n/)
    .reduce((width, line) => Math.max(width, measure(line).width), 1);
  const characters = new Set(
    Array.from(
      new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
      (part) => part.segment
    )
  );
  const minimum =
    Array.from(characters).reduce(
      (width, character) => Math.max(width, measure(character).width),
      1
    ) + DRAWING_TEXT_HORIZONTAL_PADDING;
  const logicalWidth = Math.max(
    minimum,
    args.autoWidth
      ? Math.min(args.wrapWidth, natural + DRAWING_TEXT_HORIZONTAL_PADDING + 1)
      : args.wrapWidth
  );
  const lines = wrapDrawingTextLines(
    text,
    Math.max(1, logicalWidth - DRAWING_TEXT_HORIZONTAL_PADDING),
    (line) => measure(line).width
  );
  const ink = readLineInk(lines, fontSize, measure);
  const font = measure('Mg');
  const ascent = font.fontBoundingBoxAscent ?? fontSize * 0.8;
  const descent = font.fontBoundingBoxDescent ?? fontSize * 0.2;
  const inkAscent = ink.reduce((value, line) => Math.max(value, line.ascent), 0);
  const inkDescent = ink.reduce((value, line) => Math.max(value, line.descent), 0);
  const overhang = Math.max(0, inkAscent - ascent, inkDescent - descent);
  const lineHeight = Math.max(
    fontSize * DRAWING_TEXT_LINE_HEIGHT_FACTOR,
    ascent + descent + overhang * 2
  );
  const leading = (lineHeight - ascent - descent) / 2;
  const inkLeftBearing = ink.reduce((value, line) => Math.max(value, -line.left), 0);
  const inkRightOverhang = ink.reduce(
    (value, line) => Math.max(value, line.left + line.width - line.advance),
    0
  );
  const originX = padding + Math.max(inkLeftBearing, inkRightOverhang);
  // Keep a clear center in an empty row, including at very small imported font sizes.
  const verticalPadding = Math.min(padding, Math.max(0, (lineHeight - 1) / 2));
  const includeEmpty = args.editing || !ink.length;
  const firstRow = includeEmpty ? 0 : ink[0]!.row;
  const lastRow = includeEmpty ? lines.length - 1 : ink.at(-1)!.row;
  const firstCellTop = verticalPadding - firstRow * lineHeight;
  const firstBaseline = firstCellTop + ascent + leading;
  const advance = ink.reduce((value, line) => Math.max(value, line.advance), 1);
  return {
    width: Math.max(args.autoWidth ? 0 : logicalWidth, advance + originX * 2),
    height: (lastRow - firstRow + 1) * lineHeight + verticalPadding * 2,
    logicalWidth,
    originX,
    firstBaseline,
    lineHeight,
    fontAscent: ascent,
    fontDescent: descent,
    inkLeftBearing,
    inkRightOverhang,
    inkAscent,
    inkDescent,
    lines,
    backgrounds: lineBackgrounds(ink, originX, firstCellTop, lineHeight, verticalPadding),
  };
}
