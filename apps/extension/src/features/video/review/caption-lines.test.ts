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
