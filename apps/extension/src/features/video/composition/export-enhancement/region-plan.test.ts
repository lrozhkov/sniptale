import { it } from 'vitest';
import assert from 'node:assert/strict';
import { createCanvas } from 'canvas';
import { parseEnhancementMode } from './mode';
import { planEnhancedRegion, paintPaddedInput } from './region-plan';
const request = {
  sourceSize: { width: 1904, height: 1064 },
  roi: { x: 350, y: 200, width: 960, height: 540 },
  targetSize: { width: 1920, height: 1080 },
  zoomActive: true,
};
it('FullHD and lens use original pixels and the established 32-pixel context', () => {
  const full = planEnhancedRegion({ ...request, mode: 'clark-x2' });
  assert.deepEqual(full.tiles[0]!.input, { x: 318, y: 168, width: 1024, height: 604 });
  const lens = planEnhancedRegion({
    ...request,
    mode: 'clark-x2',
    roi: { ...request.roi, width: 480, height: 270 },
    targetSize: { width: 960, height: 540 },
  });
  assert.deepEqual(lens.tiles[0]!.input, { x: 318, y: 168, width: 544, height: 334 });
  assert.throws(() => parseEnhancementMode('span'));
  assert.throws(() =>
    planEnhancedRegion({ ...request, mode: 'clark-x2', roi: { ...request.roi, x: -1 } })
  );
});

it('fractional ROI and non-2x scaling cover each destination pixel exactly once', () => {
  const p = planEnhancedRegion({
    mode: 'clark-x2',
    sourceSize: { width: 201, height: 99 },
    roi: { x: 17.25, y: 8.125, width: 65.25, height: 37.75 },
    targetSize: { width: 131, height: 75 },
    zoomActive: true,
    coreLimit: { width: 24, height: 18 },
  });
  const coverage = new Uint8Array(131 * 75);
  for (const t of p.tiles) {
    assert.equal(Math.abs(t.input.x % 2), 0);
    assert.equal(Math.abs(t.input.y % 2), 0);
    assert.equal(t.input.width % 2, 0);
    assert.equal(t.input.height % 2, 0);
    assert.ok(
      Math.abs(t.input.x + t.coreInInput.x - (17.25 + (t.destination.x * 65.25) / 131)) < 1e-9
    );
    for (let y = t.destination.y; y < t.destination.y + t.destination.height; y++)
      for (let x = t.destination.x; x < t.destination.x + t.destination.width; x++)
        coverage[y * 131 + x] = coverage[y * 131 + x]! + 1;
  }
  assert.ok(coverage.every((n) => n === 1));
});

it('4K output is tiled within Clark limits and shares the source pixel phase', () => {
  const p = planEnhancedRegion({
    mode: 'clark-x2',
    sourceSize: { width: 3840, height: 2160 },
    roi: { x: 17.25, y: 10.5, width: 1920, height: 1080 },
    targetSize: { width: 3840, height: 2160 },
    zoomActive: true,
  });
  assert.equal(p.tiles.length, 4);
  assert.ok(p.tiles.every((t) => t.input.width <= 1028 && t.input.height <= 608));
});

it('edge padding preserves original RGB pixels and fills all four corners', () => {
  const source = createCanvas(3, 3),
    ctx = source.getContext('2d'),
    pixels = ctx.createImageData(3, 3);
  for (let i = 0; i < 9; i++) pixels.data.set([i * 20, i * 10, 250 - i, 255], i * 4);
  ctx.putImageData(pixels, 0, 0);
  const tile = planEnhancedRegion({
    mode: 'clark-x2',
    sourceSize: { width: 3, height: 3 },
    roi: { x: 0, y: 0, width: 3, height: 3 },
    targetSize: { width: 6, height: 6 },
    zoomActive: true,
  }).tiles[0]!;
  const out = createCanvas(tile.input.width, tile.input.height),
    target = out.getContext('2d');
  paintPaddedInput(
    target as unknown as CanvasRenderingContext2D,
    source as unknown as CanvasImageSource,
    { width: 3, height: 3 },
    tile.input
  );
  const actual = target.getImageData(0, 0, out.width, out.height).data;
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const sx = Math.max(0, Math.min(2, x + tile.input.x)),
        sy = Math.max(0, Math.min(2, y + tile.input.y));
      assert.deepEqual(
        actual.subarray((y * out.width + x) * 4, (y * out.width + x) * 4 + 4),
        pixels.data.subarray((sy * 3 + sx) * 4, (sy * 3 + sx) * 4 + 4)
      );
    }
});
