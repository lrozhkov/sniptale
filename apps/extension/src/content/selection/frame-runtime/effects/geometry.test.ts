// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  createBlurSettingsFixture,
  createFocusSettingsFixture,
  createFrameDataFixture,
} from '../test-support';
import {
  createFocusMaskRectNodes,
  getBlurBackdropStyle,
  getBlurOverlayBox,
  getFocusMaskBox,
} from './geometry';

function createBorderSettings(width = 4) {
  return {
    ...createFrame().borderSettings!,
    width,
  };
}

function createFrame(overrides: Parameters<typeof createFrameDataFixture>[1] = {}) {
  return createFrameDataFixture('frame-1', overrides);
}

function expectFocusMaskRectAttributes(
  frame: ReturnType<typeof createFrame>,
  expected: { x: string; y: string; width: string; height: string }
) {
  const [rect] = createFocusMaskRectNodes([frame]);
  expect(rect?.getAttribute('x')).toBe(expected.x);
  expect(rect?.getAttribute('y')).toBe(expected.y);
  expect(rect?.getAttribute('width')).toBe(expected.width);
  expect(rect?.getAttribute('height')).toBe(expected.height);
}

function expectCanonicalBlurGeometry(showBorder: boolean) {
  const frame = createFrame({
    blurSettings: createBlurSettingsFixture({ showBorder }),
    borderSettings: createBorderSettings(),
    x: 15,
    y: 25,
    width: 130,
    height: 90,
  });

  expect(getBlurOverlayBox(frame)).toEqual({
    x: 15,
    y: 25,
    width: 130,
    height: 90,
  });
}

function expectCanonicalFocusGeometry(showBorder: boolean) {
  const frame = createFrame({
    focusSettings: createFocusSettingsFixture({ showBorder }),
    borderSettings: createBorderSettings(),
    x: 30,
    y: 40,
    width: 150,
    height: 70,
  });

  expect(getFocusMaskBox(frame)).toEqual({
    x: 30,
    y: 40,
    width: 150,
    height: 70,
  });
  expectFocusMaskRectAttributes(frame, {
    x: '30',
    y: '40',
    width: '150',
    height: '70',
  });
}

function expectPixelateBlurFallbackStyle() {
  expect(
    getBlurBackdropStyle({
      blurSettings: createBlurSettingsFixture({ amount: 15, blurType: 'pixelate' }),
    })
  ).toEqual({
    backdropFilter: 'blur(5px)',
    backgroundColor: 'color-mix(in srgb, var(--sniptale-color-surface-panel) 8%, transparent)',
    imageRendering: 'pixelated',
  });
}

describe('frame-manager-effect-geometry', () => {
  it.each([false, true])(
    'keeps blur on the canonical outer frame rect when decoration visibility is %s',
    expectCanonicalBlurGeometry
  );

  it('falls back to a pixelated blur style when pixelate frames reach the content overlay', () => {
    expectPixelateBlurFallbackStyle();
  });

  it.each([false, true])(
    'keeps focus on the canonical outer frame rect when decoration visibility is %s',
    expectCanonicalFocusGeometry
  );
});
