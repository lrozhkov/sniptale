import { expect, it } from 'vitest';
import {
  clampDrawingTextWidth,
  resolveDrawingTextHeight,
  resolveDrawingTextMeasuredNaturalWidth,
  resolveDrawingTextNaturalWidth,
} from './text-layout';

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
