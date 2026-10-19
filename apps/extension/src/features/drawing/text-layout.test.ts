import { expect, it } from 'vitest';
import {
  clampDrawingTextWidth,
  resolveDrawingTextHeight,
  resolveDrawingTextMeasuredNaturalWidth,
  resolveDrawingTextNaturalWidth,
  resolveDrawingTextBackgroundRadii,
  resolveDrawingTextBackgroundContours,
  traceDrawingTextBackground,
  isDrawingTextStencil,
} from './text-layout';

it.each(['transparent', '#0000', '#12345600', 'rgba(12, 34, 56, 0)', 'hsl(120 50% 50% / 0%)'])(
  'uses a stencil only for zero-alpha %s with a background',
  (color) => {
    expect(isDrawingTextStencil(color, '#ff8800')).toBe(true);
    expect(isDrawingTextStencil(color, null)).toBe(false);
  }
);

it.each(['#123456', '#12345601', 'rgba(12, 34, 56, 0.001)', 'invalid'])(
  'keeps visible or invalid %s out of stencil mode',
  (color) => expect(isDrawingTextStencil(color, '#ff8800')).toBe(false)
);

it('removes the internal edge between equal-width line backgrounds', () => {
  expect(
    resolveDrawingTextBackgroundContours([
      { left: 0, top: 0, width: 120, height: 25 },
      { left: 0, top: 25, width: 120, height: 25 },
    ])
  ).toEqual([
    [
      { x: 120, y: 0, radius: 3 },
      { x: 120, y: 50, radius: 3 },
      { x: 0, y: 50, radius: 3 },
      { x: 0, y: 0, radius: 3 },
    ],
  ]);
});

it('keeps exposed rounded corners and square concave steps for unequal lines', () => {
  expect(
    resolveDrawingTextBackgroundContours([
      { left: 0, top: 0, width: 120, height: 25 },
      { left: 0, top: 25, width: 80, height: 25 },
      { left: 0, top: 50, width: 100, height: 25 },
    ])
  ).toEqual([
    [
      { x: 120, y: 0, radius: 3 },
      { x: 120, y: 25, radius: 3 },
      { x: 80, y: 25, radius: 0 },
      { x: 80, y: 50, radius: 0 },
      { x: 100, y: 50, radius: 3 },
      { x: 100, y: 75, radius: 3 },
      { x: 0, y: 75, radius: 3 },
      { x: 0, y: 0, radius: 3 },
    ],
  ]);
});

it('traces both sides of horizontally shifted, overlapping line backgrounds', () => {
  expect(
    resolveDrawingTextBackgroundContours([
      { left: 0, top: 0, width: 100, height: 25 },
      { left: 20, top: 25, width: 100, height: 25 },
    ])
  ).toEqual([
    [
      { x: 100, y: 0, radius: 3 },
      { x: 100, y: 25, radius: 0 },
      { x: 120, y: 25, radius: 3 },
      { x: 120, y: 50, radius: 3 },
      { x: 20, y: 50, radius: 3 },
      { x: 20, y: 25, radius: 0 },
      { x: 0, y: 25, radius: 3 },
      { x: 0, y: 0, radius: 3 },
    ],
  ]);
});

it('keeps vertically or horizontally separated backgrounds in distinct contours', () => {
  const contours = resolveDrawingTextBackgroundContours([
    { left: 0, top: 0, width: 120, height: 25 },
    { left: 0, top: 30, width: 12, height: 25 },
    { left: 40, top: 55, width: 80, height: 25 },
  ]);
  expect(contours).toHaveLength(3);
  expect(contours.map((contour) => contour.length)).toEqual([4, 4, 4]);
  expect(contours.flat().every((corner) => corner.radius === 3)).toBe(true);
  expect(resolveDrawingTextBackgroundContours([])).toEqual([]);
});

it('uses circular corner tangents to trace the outer contour once', () => {
  const operations: Array<readonly (string | number)[]> = [];
  traceDrawingTextBackground(
    {
      moveTo: (...coordinates) => operations.push(['moveTo', ...coordinates]),
      arcTo: (...coordinates) => operations.push(['arcTo', ...coordinates]),
      closePath: () => operations.push(['closePath']),
    },
    [
      { left: 0, top: 0, width: 120, height: 25 },
      { left: 0, top: 25, width: 120, height: 25 },
    ]
  );
  expect(operations).toEqual([
    ['moveTo', 117, 0],
    ['arcTo', 120, 0, 120, 50, 3],
    ['arcTo', 120, 50, 0, 50, 3],
    ['arcTo', 0, 50, 0, 0, 3],
    ['arcTo', 0, 0, 120, 0, 3],
    ['closePath'],
  ]);
});

it.each([
  [
    [120, 120],
    [
      [3, 3, 0, 0],
      [0, 0, 3, 3],
    ],
  ],
  [
    [120, 80],
    [
      [3, 3, 3, 0],
      [0, 0, 3, 3],
    ],
  ],
  [
    [80, 120],
    [
      [3, 3, 0, 0],
      [0, 3, 3, 3],
    ],
  ],
  [
    [120, 119],
    [
      [3, 3, 1, 0],
      [0, 0, 3, 3],
    ],
  ],
] as const)('joins adjacent backgrounds with widths %s', (widths, expected) => {
  const lines = widths.map((width, index) => ({ left: 0, top: index * 25.5, height: 25.5, width }));
  expect(lines.map((_line, index) => resolveDrawingTextBackgroundRadii(lines, index))).toEqual(
    expected
  );
});

it('keeps exposed corners rounded for separate lines and blanks', () => {
  const lines = [
    { left: 0, top: 0, width: 120, height: 25 },
    { left: 0, top: 30, width: 12, height: 25 },
    { left: 40, top: 55, width: 80, height: 25 },
  ];
  expect(lines.map((_line, index) => resolveDrawingTextBackgroundRadii(lines, index))).toEqual([
    [3, 3, 3, 3],
    [3, 3, 3, 3],
    [3, 3, 3, 3],
  ]);
});

it('lets a short text box resize beyond its natural width', () => {
  expect(clampDrawingTextWidth('Hi', 20, 0)).toBe(80);
  expect(clampDrawingTextWidth('Hi', 20, 1_000)).toBe(640);
  expect(clampDrawingTextWidth('Hi', 20, 260)).toBe(260);
});

it('derives distinct minimum and maximum widths from longer text', () => {
  const text = 'Averylongunbrokenword followed by enough text to form a wider paragraph';
  const minimum = clampDrawingTextWidth(text, 20, 0);
  const maximum = clampDrawingTextWidth(text, 20, 1_000);

  expect(minimum).toBe(188);
  expect(maximum).toBeLessThanOrEqual(640);
  expect(maximum).toBeGreaterThan(minimum);
  expect(clampDrawingTextWidth(text, 20, (minimum + maximum) / 2)).toBe((minimum + maximum) / 2);
});

it('grows a natural line width until the available workspace edge', () => {
  expect(resolveDrawingTextNaturalWidth('A longer single line', 20, 500)).toBeGreaterThan(80);
  expect(resolveDrawingTextNaturalWidth('A'.repeat(100), 20, 240)).toBe(240);
});

it('uses measured font metrics for a 36px auto-width line without leaving a trailing word', () => {
  const text = 'Large handwritten text stays on one line';
  const measured = resolveDrawingTextMeasuredNaturalWidth(
    text,
    36,
    1_000,
    (line) => line.length * 19.8
  );

  expect(measured).toBeGreaterThan(text.length * 19.8 + 12);
  expect(resolveDrawingTextHeight(text, 36, measured)).toBe(49);
});

it('uses measured glyph widths to keep selection height aligned after resize', () => {
  const measure = (line: string) => line.length * 10;

  expect(resolveDrawingTextHeight('one two three', 20, 160, measure)).toBe(29);
  expect(resolveDrawingTextHeight('one two three', 20, 70, measure)).toBe(79);
});

it('grows height for explicit lines, ordinary wrapping, and long-word wrapping', () => {
  const oneLine = resolveDrawingTextHeight('one', 20, 80);
  const explicitLines = resolveDrawingTextHeight('one\n\nthree', 20, 80);
  const wrappedWords = resolveDrawingTextHeight('one two three four', 20, 80);
  const wrappedLongWord = resolveDrawingTextHeight(
    'a abcdefghijklmnopqrstuvwxyz0123456789',
    20,
    80
  );

  expect(explicitLines).toBeGreaterThan(oneLine);
  expect(wrappedWords).toBeGreaterThan(oneLine);
  expect(wrappedLongWord).toBeGreaterThan(wrappedWords);
});
