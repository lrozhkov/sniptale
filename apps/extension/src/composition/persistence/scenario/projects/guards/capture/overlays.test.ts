import { expect, it } from 'vitest';

import { parseCaptureOverlays } from './overlays';
import { createOverlayFixtures } from './test-support';

it('parses persisted overlay unions and preserves auto sources', () => {
  const overlays = parseCaptureOverlays(createOverlayFixtures());

  expect(overlays.map((overlay) => overlay.kind)).toEqual([
    'focus-rect',
    'click-ring',
    'cursor',
    'blur-rect',
    'arrow',
    'rectangle',
    'ellipse',
    'text',
  ]);
  expect(overlays[0]).toEqual(
    expect.objectContaining({ autoSource: 'capture-target', kind: 'focus-rect' })
  );
  expect(overlays[1]).toEqual(
    expect.objectContaining({ autoSource: 'capture-click', kind: 'click-ring' })
  );
  expect(overlays[3]).toEqual(
    expect.objectContaining({
      blurSettings: { amount: 13, blurType: 'gaussian', showBorder: false },
      kind: 'blur-rect',
    })
  );
});

it('parses optional blur border fields without requiring them for legacy overlays', () => {
  expect(parseCaptureOverlays(createBlurBorderFixtures())).toEqual([
    expect.objectContaining({
      blurSettings: {
        amount: 13,
        blurType: 'gaussian',
        borderPresetId: null,
        radius: 8,
        shadow: 20,
        showBorder: true,
        strokeColor: '#112233',
        strokeOpacity: 0.6,
        strokeStyle: 'long-dash',
        strokeWidth: 0,
      },
    }),
    expect.objectContaining({
      blurSettings: {
        amount: 14,
        blurType: 'solid',
        borderPresetId: 'preset-1',
        showBorder: true,
      },
    }),
  ]);
});

function createBlurBorderFixtures() {
  return [
    {
      blurSettings: {
        amount: 13,
        blurType: 'gaussian',
        borderPresetId: null,
        radius: 8,
        shadow: 20,
        showBorder: true,
        strokeColor: '#112233',
        strokeOpacity: 0.6,
        strokeStyle: 'long-dash',
        strokeWidth: 0,
      },
      id: 'styled-blur',
      kind: 'blur-rect',
      rect: { height: 12, width: 11, x: 9, y: 10 },
    },
    {
      blurSettings: {
        amount: 14,
        blurType: 'solid',
        borderPresetId: 'preset-1',
        showBorder: true,
        strokeStyle: 'invalid',
      },
      id: 'legacy-blur',
      kind: 'blur-rect',
      rect: { height: 22, width: 21, x: 19, y: 20 },
    },
  ];
}

it('drops malformed overlay records', () => {
  expect(
    parseCaptureOverlays([
      { id: 'missing-rect', kind: 'focus-rect' },
      { id: 'bad-arrow', kind: 'arrow', start: { x: 1, y: 2 } },
      { kind: 'text' },
    ])
  ).toEqual([]);
});
