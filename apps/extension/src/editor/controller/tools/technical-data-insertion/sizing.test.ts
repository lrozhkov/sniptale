// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { getTechnicalDataTextWidth } from './sizing';

const settings = {
  backgroundColor: null,
  color: '#111111',
  fontFamily: 'handwritten' as const,
  fontSize: 20,
};

afterEach(() => vi.restoreAllMocks());

it('uses a stable column width and expands row layouts to measured text', () => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({ font: '', measureText: () => ({ width: 498 }) })),
  });
  expect(getTechnicalDataTextWidth('Technical data', 'column', settings)).toBe(360);
  expect(getTechnicalDataTextWidth('Technical data', 'row', settings)).toBe(500);
});

it('uses deterministic text length fallback when measurement is unavailable', () => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => null),
  });
  expect(getTechnicalDataTextWidth('A'.repeat(40), 'row', settings)).toBe(576);
});
