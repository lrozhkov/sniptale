import { expect, it } from 'vitest';

import { isCaptureContext, isPoint } from './element-guards.capture.ts';

function createCaptureContext() {
  return {
    captureMetadata: {
      pointerRange: {
        distance: 12,
        durationMs: 90,
        end: { x: 12, y: 18 },
        maxX: 12,
        maxY: 18,
        minX: 4,
        minY: 6,
        start: { x: 4, y: 6 },
      },
      scroll: {
        deltaX: 0,
        deltaY: 80,
        endX: 0,
        endY: 120,
        startX: 0,
        startY: 40,
      },
      trigger: 'pointer-up',
    },
    cursorPoint: { x: 10, y: 20 },
    interactionPoint: null,
    page: {
      devicePixelRatio: 2,
      scrollX: 0,
      scrollY: 120,
      title: 'Page',
      url: 'https://example.com',
      viewport: { height: 720, width: 1280, x: 0, y: 0 },
    },
    target: {
      ariaLabel: null,
      framePadding: { bottom: 1, left: 2, right: 3, top: 4 },
      iframeSelector: null,
      rect: { height: 40, width: 80, x: 8, y: 16 },
      role: 'button',
      selector: '#button',
      tagName: 'button',
      text: 'Submit',
      title: null,
    },
  };
}

it('accepts null and complete capture context payloads', () => {
  expect(isCaptureContext(null)).toBe(true);
  expect(isCaptureContext(createCaptureContext())).toBe(true);
  expect(isPoint({ x: 1, y: 2 })).toBe(true);
});

it('rejects malformed nested capture context payloads', () => {
  expect(
    isCaptureContext({ ...createCaptureContext(), captureMetadata: { trigger: 'hover' } })
  ).toBe(false);
  expect(
    isCaptureContext({
      ...createCaptureContext(),
      captureMetadata: { ...createCaptureContext().captureMetadata, pointerRange: { start: {} } },
    })
  ).toBe(false);
  expect(
    isCaptureContext({
      ...createCaptureContext(),
      page: { ...createCaptureContext().page, viewport: { width: 1280 } },
    })
  ).toBe(false);
  expect(
    isCaptureContext({
      ...createCaptureContext(),
      target: { ...createCaptureContext().target, framePadding: { top: 'bad' } },
    })
  ).toBe(false);
  expect(isPoint({ x: 1, y: Number.NaN })).toBe(false);
});
