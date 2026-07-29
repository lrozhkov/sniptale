import { describe, expect, it } from 'vitest';
import { clampWindowPosition, doesSizeFit, selectDisplayForWindow } from './display-geometry';

const leftDisplay = {
  id: 'left',
  isPrimary: false,
  bounds: { left: -1920, top: 0, width: 1920, height: 1080 },
  workArea: { left: -1920, top: 0, width: 1920, height: 1040 },
} as chrome.system.display.DisplayUnitInfo;

const primaryDisplay = {
  id: 'primary',
  isPrimary: true,
  bounds: { left: 0, top: 0, width: 1920, height: 1080 },
  workArea: { left: 0, top: 0, width: 1920, height: 1040 },
} as chrome.system.display.DisplayUnitInfo;

describe('capture-surface display geometry', () => {
  it('selects the display with the largest current-window intersection', () => {
    expect(
      selectDisplayForWindow({ left: -1600, top: 40, width: 1200, height: 800 }, [
        primaryDisplay,
        leftDisplay,
      ])?.id
    ).toBe('left');
  });

  it('uses the primary display when the window has no display intersection', () => {
    expect(
      selectDisplayForWindow({ left: 9000, top: 9000, width: 100, height: 100 }, [
        leftDisplay,
        primaryDisplay,
      ])?.id
    ).toBe('primary');
  });

  it('clamps positions inside negative-coordinate work areas without changing size', () => {
    const workArea = { left: -1920, top: -100, width: 1920, height: 1040 };
    expect(
      clampWindowPosition(workArea, { left: -2500, top: 1000, width: 1280, height: 720 })
    ).toEqual({ left: -1920, top: 220 });
    expect(doesSizeFit(workArea, 1920, 1040)).toBe(true);
    expect(doesSizeFit(workArea, 1921, 1040)).toBe(false);
  });
});
