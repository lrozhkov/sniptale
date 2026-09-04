import { describe, expect, it } from 'vitest';
import { resolveVideoProjectCameraPlacement, VideoProjectCameraPlacement } from './placement';

describe('camera overlay placement', () => {
  it('places a landscape camera inside each canvas corner with one stable size', () => {
    const placements = Object.values(VideoProjectCameraPlacement).map((placement) =>
      resolveVideoProjectCameraPlacement({
        placement,
        projectHeight: 1080,
        projectWidth: 1920,
        sourceHeight: 360,
        sourceWidth: 640,
      })
    );

    expect(new Set(placements.map(({ height, width }) => `${width}:${height}`)).size).toBe(1);
    expect(placements).toEqual([
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    ]);
    expect(
      placements.every(
        ({ height, width, x, y }) => x >= 0 && y >= 0 && x + width <= 1920 && y + height <= 1080
      )
    ).toBe(true);
  });

  it('keeps portrait and tiny-canvas camera geometry bounded', () => {
    const placement = resolveVideoProjectCameraPlacement({
      placement: VideoProjectCameraPlacement.BOTTOM_RIGHT,
      projectHeight: 90,
      projectWidth: 160,
      sourceHeight: 1920,
      sourceWidth: 1080,
    });

    expect(placement.x).toBeGreaterThanOrEqual(0);
    expect(placement.y).toBeGreaterThanOrEqual(0);
    expect(placement.x + placement.width).toBeLessThanOrEqual(160);
    expect(placement.y + placement.height).toBeLessThanOrEqual(90);
  });
});
