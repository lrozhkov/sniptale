import { describe, expect, it } from 'vitest';
import {
  getTextDecorationLines,
  hasTextDecorationLine,
  toggleTextDecorationLine,
} from './decoration';

describe('text decoration helpers', () => {
  it('keeps underline and line-through as independent decoration lines', () => {
    expect(toggleTextDecorationLine('none', 'underline')).toBe('underline');
    expect(toggleTextDecorationLine('underline', 'line-through')).toBe('underline line-through');
    expect(toggleTextDecorationLine('underline line-through', 'underline')).toBe('line-through');
  });

  it('normalizes supported decoration lines in stable order', () => {
    expect(getTextDecorationLines('overline line-through underline')).toEqual([
      'underline',
      'line-through',
    ]);
    expect(hasTextDecorationLine('underline line-through', 'line-through')).toBe(true);
  });
});
