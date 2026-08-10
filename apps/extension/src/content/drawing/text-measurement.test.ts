// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { measureContentDrawingText } from './text-measurement';

it('keeps deterministic measurement when the content runtime canvas is unavailable', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

  expect(
    measureContentDrawingText({ fontFamily: 'handwritten', fontSize: 24, line: 'Text' })
  ).toBeCloseTo(52.8);
});
