import { describe, expect, it } from 'vitest';
import { getStepBadgeBoundaryCenter, projectStepBadgeToFrameBoundary } from './placement';
import { getStepBadgeStyle } from './views';

const frameRect = { x: 100, y: 80, width: 200, height: 120 };

describe('step badge boundary placement', () => {
  it('keeps a manual badge center mathematically on the selected border axis', () => {
    expect(getStepBadgeBoundaryCenter(frameRect, { position: 0.25, side: 'bottom' })).toEqual({
      x: 150,
      y: 200,
    });
    expect(getStepBadgeBoundaryCenter(frameRect, { position: 0.75, side: 'left' })).toEqual({
      x: 100,
      y: 170,
    });
  });

  it('maps the normalized position to the visual stroke center, including border width', () => {
    const style = getStepBadgeStyle({
      borderColor: '#111',
      borderWidth: 4,
      clickable: false,
      settings: {
        enabled: true,
        manualPlacement: { position: 0.75, side: 'bottom' },
        type: 'number',
        value: '4',
      },
      zIndex: 10,
    });

    expect(style.bottom).toBe(-2);
    expect(style.left).toBe('calc(75% + 1px)');
    expect(style.transform).toBe('translate(-50%, 50%) translate(0px, 0px)');
  });

  it('projects free pointer movement onto one exact frame border', () => {
    const placement = projectStepBadgeToFrameBoundary({
      frameRect,
      point: { x: 238, y: 52 },
    });

    expect(placement).toEqual({ position: 0.69, side: 'top' });
    expect(getStepBadgeBoundaryCenter(frameRect, placement)).toEqual({ x: 238, y: 80 });
  });

  it('uses a corner dead zone to avoid switching sides for tiny pointer movements', () => {
    expect(
      projectStepBadgeToFrameBoundary({
        frameRect,
        point: { x: 302, y: 78 },
        previousSide: 'right',
      })
    ).toEqual({ position: 0, side: 'right' });
  });
});
