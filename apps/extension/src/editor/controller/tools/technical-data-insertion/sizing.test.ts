// @vitest-environment jsdom

import { Textbox } from 'fabric';
import { afterEach, expect, it, vi } from 'vitest';
import { resizeTechnicalDataTextObject } from './sizing';

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
  const text = new Textbox('Technical data');
  vi.spyOn(text, 'set');

  resizeTechnicalDataTextObject(text, 'Technical data', 'column', settings);
  expect(text.set).toHaveBeenLastCalledWith({ width: 360 });

  resizeTechnicalDataTextObject(text, 'Technical data', 'row', settings);
  expect(text.set).toHaveBeenLastCalledWith({ width: 500 });
});

it('uses deterministic text length fallback when measurement is unavailable', () => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => null),
  });
  const text = new Textbox('A'.repeat(40));
  vi.spyOn(text, 'set');

  resizeTechnicalDataTextObject(text, 'A'.repeat(40), 'row', settings);

  expect(text.set).toHaveBeenCalledWith({ width: 576 });
});
