import { expect, it } from 'vitest';
import {
  measureDrawingTextWithTabs,
  resolveDrawingTextRuns,
  resolveDrawingTextInkLayout,
  wrapDrawingTextLines,
} from './text-ink';

const measure = (text: string) => ({
  width: text.length * 10,
  actualBoundingBoxLeft: text.trim() ? 2 : 0,
  actualBoundingBoxRight: text.trimEnd().length * 10 - 1,
  actualBoundingBoxAscent: 17,
  actualBoundingBoxDescent: 4,
  fontBoundingBoxAscent: 22,
  fontBoundingBoxDescent: 6,
});

it('fits native font cells with symmetric margins and contains overhanging ink', () => {
  const layout = resolveDrawingTextInkLayout({
    text: 'Any font',
    fontSize: 27,
    wrapWidth: 500,
    autoWidth: true,
    measure,
  });
  expect(layout.originX).toBe(layout.width - layout.originX - measure('Any font').width);
  expect(layout.firstBaseline - layout.fontAscent).toBe(
    layout.height - layout.firstBaseline - layout.fontDescent
  );
  expect(layout.originX - 2).toBeGreaterThanOrEqual(6);
  expect(layout.firstBaseline - 17).toBeGreaterThanOrEqual(6);
});
it('retains source whitespace and empty rows without expanding committed ink', () => {
  const args = { fontSize: 24, wrapWidth: 500, autoWidth: true, measure };
  const plain = resolveDrawingTextInkLayout({ ...args, text: 'Word' });
  const spaced = resolveDrawingTextInkLayout({ ...args, text: 'Word   \n\n' });
  expect(spaced.width).toBe(plain.width);
  expect(spaced.height).toBe(plain.height);
  expect(spaced.lines.join('\n')).toBe('Word   \n\n');
  expect(spaced.backgrounds).toEqual(plain.backgrounds);
});
it('keeps a manual wrapping column and a common baseline grid', () => {
  const layout = resolveDrawingTextInkLayout({
    text: 'First next last',
    fontSize: 24,
    wrapWidth: 82,
    autoWidth: false,
    measure,
  });
  expect(layout.width).toBe(82);
  expect(layout.lines).toEqual(['First ', 'next ', 'last']);
  expect(layout.lineHeight).toBe(30);
  for (const row of [0, 1, 2]) {
    const y = layout.firstBaseline + row * layout.lineHeight;
    expect(layout.backgrounds.some((rect) => rect.top <= y && rect.top + rect.height > y)).toBe(
      true
    );
  }
});
it('wraps long words without splitting a user-visible grapheme or deleting spaces', () => {
  const text = 'a\u0301b👩‍💻c';
  const measureGraphemes = (value: string) =>
    Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)).length *
    10;
  expect(wrapDrawingTextLines(text, 20, measureGraphemes)).toEqual(['a\u0301b', '👩‍💻c']);
  expect(wrapDrawingTextLines('  one   two\n', 50, (value) => value.length * 10).join('')).toBe(
    '  one   two'
  );
});
it('reserves empty editing rows for native caret movement without adding their backgrounds', () => {
  const args = { text: 'Word\n\n', fontSize: 24, wrapWidth: 500, autoWidth: true, measure };
  const committed = resolveDrawingTextInkLayout(args);
  const editing = resolveDrawingTextInkLayout({ ...args, editing: true });
  expect(editing.height).toBeGreaterThan(committed.height);
  expect(editing.backgrounds).toHaveLength(1);
});

it('keeps editing frame on the same outer background bounds for populated rows', () => {
  const args = {
    text: 'Any font\n123\n32132312',
    fontSize: 27,
    wrapWidth: 500,
    autoWidth: true,
    measure,
  };
  const committed = resolveDrawingTextInkLayout(args);
  const editing = resolveDrawingTextInkLayout({ ...args, editing: true });
  expect(editing.width).toBe(committed.width);
  expect(editing.height).toBe(committed.height);
  expect(Math.min(...editing.backgrounds.map((rect) => rect.top))).toBe(0);
  expect(Math.max(...editing.backgrounds.map((rect) => rect.top + rect.height))).toBe(
    editing.height
  );
});

it('aligns letter and digit backgrounds to one column and pads the native font cell equally', () => {
  const measureCells = (text: string) => ({
    width: text.length * 10,
    actualBoundingBoxLeft: /^\d/u.test(text) ? 1 : 0,
    actualBoundingBoxRight: text.length * 10,
    actualBoundingBoxAscent: /^\d/u.test(text) ? 19 : 25,
    actualBoundingBoxDescent: /^\d/u.test(text) ? 0 : 13,
    fontBoundingBoxAscent: 31,
    fontBoundingBoxDescent: 14,
  });
  const layout = resolveDrawingTextInkLayout({
    text: 'letters\n1 letters\n\n321312312',
    fontSize: 36,
    wrapWidth: 500,
    autoWidth: true,
    editing: true,
    measure: measureCells,
  });
  expect(layout.backgrounds.every((rect) => rect.left === 0)).toBe(true);
  const selected = layout.backgrounds.at(-1)!;
  const selectionTop = layout.firstBaseline + 3 * layout.lineHeight - 31;
  const selectionBottom = selectionTop + 45;
  expect(selectionTop - selected.top).toBe(6);
  expect(selected.top + selected.height - selectionBottom).toBe(6);
});

it('retains raw tabs and uses native eight-space stops from each visual line origin', () => {
  const source = 'A\tB\tC';
  const runs = resolveDrawingTextRuns(source, measure);
  expect(runs.map((run) => run.left)).toEqual([0, 80, 160]);
  expect(measureDrawingTextWithTabs(source, measure).width).toBe(170);
  const layout = resolveDrawingTextInkLayout({
    text: source,
    fontSize: 24,
    wrapWidth: 400,
    autoWidth: true,
    measure: (text) => measureDrawingTextWithTabs(text, measure),
  });
  expect(layout.lines).toEqual([source]);
});
