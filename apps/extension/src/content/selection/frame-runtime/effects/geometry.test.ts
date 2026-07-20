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

function expectBlurGeometryWithoutBorder() {
  const frame = createFrame({
    blurSettings: createBlurSettingsFixture({ showBorder: false }),
    borderSettings: createBorderSettings(),
    x: 15,
    y: 25,
    width: 130,
    height: 90,
  });

  expect(getBlurOverlayBox(frame)).toEqual({
    x: 19,
    y: 29,
    width: 130,
    height: 90,
  });
}

function expectBlurGeometryWithBorder() {
  const frame = createFrame({
    blurSettings: createBlurSettingsFixture({ showBorder: true }),
    borderSettings: createBorderSettings(),
    x: 15,
    y: 25,
    width: 130,
    height: 90,
  });

  expect(getBlurOverlayBox(frame)).toEqual({
    x: 19,
    y: 29,
    width: 130,
    height: 90,
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

function expectFocusGeometryWithoutBorder() {
  const frame = createFrame({
    focusSettings: createFocusSettingsFixture({ showBorder: false }),
    borderSettings: createBorderSettings(),
    x: 30,
    y: 40,
    width: 150,
    height: 70,
  });

  expect(getFocusMaskBox(frame)).toEqual({
    x: 34,
    y: 44,
    width: 150,
    height: 70,
  });
  expectFocusMaskRectAttributes(frame, {
    x: '34',
    y: '44',
    width: '150',
    height: '70',
  });
}

function expectFocusGeometryWithBorder() {
  const frame = createFrame({
    focusSettings: createFocusSettingsFixture({ showBorder: true }),
    borderSettings: createBorderSettings(),
    x: 30,
    y: 40,
    width: 150,
    height: 70,
  });

  expect(getFocusMaskBox(frame)).toEqual({
    x: 30,
    y: 40,
    width: 158,
    height: 78,
  });
  expectFocusMaskRectAttributes(frame, {
    x: '30',
    y: '40',
    width: '158',
    height: '78',
  });
}

describe('frame-manager-effect-geometry', () => {
  it('matches the raw frame rect for blur overlays when the border is hidden', () => {
    expectBlurGeometryWithoutBorder();
  });

  it('keeps the inset blur geometry when the border stays visible', () => {
    expectBlurGeometryWithBorder();
  });

  it('falls back to a pixelated blur style when pixelate frames reach the content overlay', () => {
    expectPixelateBlurFallbackStyle();
  });

  it('matches the raw frame rect for focus masks when the border is hidden', () => {
    expectFocusGeometryWithoutBorder();
  });

  it('keeps the expanded focus mask geometry when the border stays visible', () => {
    expectFocusGeometryWithBorder();
  });
});
