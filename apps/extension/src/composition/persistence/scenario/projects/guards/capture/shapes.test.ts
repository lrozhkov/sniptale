import { expect, it } from 'vitest';

import { parseBlurOverlay, parseFocusRectOverlay, parseRectKindOverlay } from './shapes';

it('parses rect-based overlays with preserved auto sources', () => {
  expect(
    parseFocusRectOverlay(
      { autoSource: 'capture-target', id: 'focus', rect: { height: 4, width: 3, x: 1, y: 2 } },
      'capture-target'
    )
  ).toEqual(expect.objectContaining({ autoSource: 'capture-target', kind: 'focus-rect' }));
  expect(
    parseRectKindOverlay(
      {
        fillColor: 'rgba(255,122,0,0.18)',
        id: 'rectangle',
        kind: 'rectangle',
        rect: { height: 40, width: 30, x: 1, y: 2 },
        strokeColor: '#ff7a00',
        strokeWidth: 2,
      },
      undefined
    )
  ).toEqual(expect.objectContaining({ kind: 'rectangle' }));
  expect(
    parseBlurOverlay(
      {
        id: 'blur',
        blurSettings: { amount: 13, blurType: 'gaussian', showBorder: false },
        rect: { height: 12, width: 11, x: 9, y: 10 },
      },
      undefined
    )
  ).toEqual(
    expect.objectContaining({
      kind: 'blur-rect',
      blurSettings: { amount: 13, blurType: 'gaussian', showBorder: false },
    })
  );
});

it('accepts pixelate blur overlays through the capture guard seam', () => {
  expect(
    parseBlurOverlay(
      {
        id: 'blur-pixelate',
        blurSettings: { amount: 9, blurType: 'pixelate', showBorder: true },
        rect: { height: 18, width: 16, x: 4, y: 5 },
      },
      undefined
    )
  ).toEqual(
    expect.objectContaining({
      kind: 'blur-rect',
      blurSettings: { amount: 9, blurType: 'pixelate', showBorder: true },
    })
  );
});

it('drops malformed blur overlays', () => {
  expect(
    parseBlurOverlay(
      {
        id: 'blur',
        blurSettings: { amount: '13', blurType: 'gaussian', showBorder: false },
        rect: { height: 12, width: 11, x: 9, y: 10 },
      },
      undefined
    )
  ).toBeNull();
  expect(parseFocusRectOverlay({ id: 'focus' }, undefined)).toBeNull();
  expect(
    parseRectKindOverlay(
      {
        fillColor: 'rgba(255,122,0,0.18)',
        id: 'ellipse',
        kind: 'ellipse',
        rect: { height: 10, width: 20, x: 2, y: 3 },
        strokeColor: '#ff7a00',
      },
      undefined
    )
  ).toBeNull();
});
