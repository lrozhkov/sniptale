import { describe, expect, it } from 'vitest';

import { resizeSelectionHeight, resizeSelectionWidth } from './resize-core';

describe('size-panel-inputs resize core', () => {
  it('clamps width changes and keeps the center anchored when aspect ratio is locked', () => {
    const selection = { x: 100, y: 80, width: 200, height: 100 };

    expect(
      resizeSelectionWidth(selection, {
        nextValue: 700,
        minSelectionSize: 100,
        maxWidth: 500,
        maxHeight: 260,
        maintainAspectRatio: true,
        aspectRatio: 2,
      })
    ).toEqual({
      x: -50,
      y: 5,
      width: 500,
      height: 250,
    });
  });

  it('clamps height changes and keeps the center anchored when aspect ratio is locked', () => {
    const selection = { x: 120, y: 100, width: 180, height: 120 };

    expect(
      resizeSelectionHeight(selection, {
        nextValue: 50,
        minSelectionSize: 100,
        maxWidth: 260,
        maxHeight: 500,
        maintainAspectRatio: true,
        aspectRatio: 1.5,
      })
    ).toEqual({
      x: 135,
      y: 110,
      width: 150,
      height: 100,
    });
  });
});
