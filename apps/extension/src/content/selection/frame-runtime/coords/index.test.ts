import { describe, expect, it } from 'vitest';

import {
  calculateFrameContainerCoords,
  createFrameCalcSettings,
  type ElementAbsolutePosition,
} from './index';

function expectDefaultSettings(value: ReturnType<typeof createFrameCalcSettings>) {
  expect(value).toEqual({
    borderWidth: 3,
    padding: {
      top: 3,
      left: 3,
      right: 3,
      bottom: 3,
    },
  });
}

describe('frame-coords createFrameCalcSettings', () => {
  it('creates default frame calculation settings when overrides are missing', () => {
    expectDefaultSettings(createFrameCalcSettings());
    expectDefaultSettings(createFrameCalcSettings(null));
  });

  it('preserves explicit border width and padding overrides', () => {
    expect(
      createFrameCalcSettings({
        width: 6,
        padding: {
          top: 1,
          left: 2,
          right: 4,
          bottom: 5,
        },
      })
    ).toEqual({
      borderWidth: 6,
      padding: {
        top: 1,
        left: 2,
        right: 4,
        bottom: 5,
      },
    });
  });
});

describe('frame-coords calculateFrameContainerCoords', () => {
  it('calculates frame container coordinates from absolute element bounds', () => {
    const elementPos: ElementAbsolutePosition = {
      x: 40,
      y: 30,
      width: 160,
      height: 90,
    };

    expect(
      calculateFrameContainerCoords(elementPos, {
        borderWidth: 2,
        padding: {
          top: 4,
          left: 5,
          right: 6,
          bottom: 7,
        },
      })
    ).toEqual({
      x: 33,
      y: 24,
      width: 171,
      height: 101,
    });
  });
});
