import { describe, expect, it } from 'vitest';

import { calculateContentSizeTooltipPosition, mergeStyleRecords } from './core';

describe('content-size-tooltip.core position', () => {
  it('prefers the first fitting tooltip candidate above the anchor', () => {
    expect(
      calculateContentSizeTooltipPosition({
        anchorRect: {
          height: 80,
          width: 160,
          x: 120,
          y: 140,
        },
        tooltipHeight: 46,
        tooltipWidth: 120,
        viewportHeight: 420,
        viewportWidth: 640,
      })
    ).toEqual({ x: 120, y: 82 });
  });

  it('falls back to a clamped inside position when no candidate fits the viewport', () => {
    expect(
      calculateContentSizeTooltipPosition({
        anchorRect: {
          height: 90,
          width: 90,
          x: 180,
          y: 150,
        },
        insideInset: 16,
        margin: 12,
        tooltipHeight: 80,
        tooltipWidth: 140,
        viewportHeight: 220,
        viewportWidth: 260,
      })
    ).toEqual({ x: 108, y: 128 });
  });
});

describe('content-size-tooltip.core style merge', () => {
  it('merges style records while skipping nullish entries', () => {
    expect(
      mergeStyleRecords(
        { alignItems: 'center', color: 'red' },
        undefined,
        { color: 'blue' },
        null,
        { opacity: 0.6 }
      )
    ).toEqual({
      alignItems: 'center',
      color: 'blue',
      opacity: 0.6,
    });
  });
});
