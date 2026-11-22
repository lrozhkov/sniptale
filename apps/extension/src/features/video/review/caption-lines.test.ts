import { expect, it } from 'vitest';
import { wrapReviewCaptionText } from './caption-lines';

const measure = (text: string) => Array.from(text).length;
it('wraps complete paragraphs and unbreakable Unicode without ellipsis', () => {
  const text = 'Первая фраза\nEnglishsuperlongword 😀😀';
  const lines = wrapReviewCaptionText(text, 7, measure);
  expect(lines.every((line) => measure(line) <= 7)).toBe(true);
  expect(lines.join('').replace(/\s/gu, '')).toBe(text.replace(/\s/gu, ''));
  expect(wrapReviewCaptionText('A\n\nB', 8, measure)).toEqual(['A', '', 'B']);
});
it('keeps combining marks and emoji families in indivisible graphemes', () => {
  expect(wrapReviewCaptionText('éé👨‍👩‍👧‍👦', 2, measure)).toEqual(['é', 'é', '👨‍👩‍👧‍👦']);
  expect(() => wrapReviewCaptionText('A', 0, measure)).toThrow('width');
});

it('bounds measurement work for a large token in a box narrower than one grapheme', () => {
  const token = 'А'.repeat(4096);
  let measured = 0;
  const lines = wrapReviewCaptionText(token, 0.1, (value) => {
    measured += value.length;
    return value.length;
  });
  expect(lines).toHaveLength(token.length);
  expect(lines.join('')).toBe(token);
  expect(measured).toBeLessThanOrEqual(token.length * 3);
});
