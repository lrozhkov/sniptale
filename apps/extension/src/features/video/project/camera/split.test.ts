import { expect, it } from 'vitest';
import { cameraSplitPanels, FULL_CAMERA_PANEL } from './split';

it.each(['left', 'right', 'top', 'bottom'] as const)(
  'keeps camera and screen separate within the frame for %s split',
  (side) => {
    const { camera, screen } = cameraSplitPanels(side);
    for (const panel of [camera, screen]) {
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.y).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(1);
      expect(panel.y + panel.height).toBeLessThanOrEqual(1);
    }
    const overlapWidth = Math.max(
      0,
      Math.min(camera.x + camera.width, screen.x + screen.width) - Math.max(camera.x, screen.x)
    );
    const overlapHeight = Math.max(
      0,
      Math.min(camera.y + camera.height, screen.y + screen.height) - Math.max(camera.y, screen.y)
    );
    expect(overlapWidth * overlapHeight).toBe(0);
    expect(camera.width * camera.height + screen.width * screen.height).toBeGreaterThan(0.95);
  }
);

it('keeps the unsplit screen at full scene size', () => {
  expect(FULL_CAMERA_PANEL).toEqual({ x: 0, y: 0, width: 1, height: 1 });
});

it.each(['left', 'right', 'top', 'bottom'] as const)(
  'preserves main video aspect in Shrink and scale in Shift for %s',
  (side) => {
    const shrink = cameraSplitPanels(side, 'shrink').screen;
    expect(shrink.width).toBeCloseTo(shrink.height, 10);
    const shift = cameraSplitPanels(side, 'shift').screen;
    expect(shift.width).toBe(1);
    expect(shift.height).toBe(1);
    expect(shift.clip).toEqual(cameraSplitPanels(side).screen);
    expect(cameraSplitPanels(side, 'overlay').screen).toMatchObject(FULL_CAMERA_PANEL);
  }
);
