// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  createGpuPreviewRenderer,
  type GpuPreviewLayer,
  type GpuPreviewRenderer,
} from './gpu-preview';
import { createGpuPreviewDrawBounds } from './gpu-preview-bounds';
import { graphics } from './gpu-preview.test-support';

let renderer: GpuPreviewRenderer | null = null;
afterEach(() => {
  renderer?.dispose();
  renderer = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('restricts a small annotation and its parent group to their visible area', async () => {
  const g = graphics();
  renderer = await createGpuPreviewRenderer();
  expect(renderer).not.toBeNull();
  const pixels = document.createElement('canvas');
  pixels.width = 32;
  pixels.height = 18;
  const annotation: GpuPreviewLayer = {
    source: pixels,
    rect: { x: 100, y: 80, width: 32, height: 18 },
    inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  };
  const size = { width: 640, height: 360 };
  await renderer!.render({
    output: size,
    logical: size,
    signal: new AbortController().signal,
    layers: [
      {
        source: { kind: 'group', output: size, logical: size, layers: [annotation] },
        rect: { x: 0, y: 0, ...size },
        inverse: annotation.inverse,
        clip: { rect: { x: 0, y: 0, ...size }, radius: 0 },
      },
    ],
  });
  expect(g.pass.setScissorRect).toHaveBeenCalledTimes(2);
  for (const [x, y, width, height] of g.pass.setScissorRect.mock.calls) {
    expect(x).toBeLessThanOrEqual(100);
    expect(y).toBeLessThanOrEqual(80);
    expect(x + width).toBeGreaterThanOrEqual(132);
    expect(y + height).toBeGreaterThanOrEqual(98);
    expect(width * height).toBeLessThan((size.width * size.height) / 100);
  }
});

function smallLayer(): GpuPreviewLayer {
  return {
    source: { width: 32, height: 18 } as HTMLCanvasElement,
    rect: { x: 100, y: 80, width: 32, height: 18 },
    inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  };
}

it('retains destination-wide coverage for masks and filtering operations', () => {
  const bounds = createGpuPreviewDrawBounds();
  const size = { width: 640, height: 360 };
  for (const change of [{ blend: 'mask' as const }, { blur: 2 }, { cssFilter: { blur: 4 } }])
    expect(bounds({ ...smallLayer(), ...change }, size, size)).toEqual([0, 0, 640, 360]);
});

it('preserves rotated footprints and falls back at a projective horizon', () => {
  const bounds = createGpuPreviewDrawBounds();
  const size = { width: 640, height: 360 };
  const rotated: GpuPreviewLayer = {
    ...smallLayer(),
    rect: { x: 0, y: 0, width: 32, height: 18 },
    inverse: [0, 1, -80, -1, 0, 132, 0, 0, 1],
  };
  const [x, y, width, height] = bounds(rotated, size, size);
  expect(x).toBeLessThanOrEqual(114);
  expect(y).toBeLessThanOrEqual(80);
  expect(x + width).toBeGreaterThanOrEqual(132);
  expect(y + height).toBeGreaterThanOrEqual(112);
  expect(width * height).toBeLessThan(2000);
  expect(bounds({ ...smallLayer(), inverse: [1, 0, 0, 0, 1, 0, 0.01, 0, -1] }, size, size)).toEqual(
    [0, 0, 640, 360]
  );
});

it('clips offscreen work and keeps nested sampling edges at a different output density', () => {
  const bounds = createGpuPreviewDrawBounds();
  const size = { width: 640, height: 360 };
  const output = { width: 1280, height: 720 };
  const [x, y, width, height] = bounds(smallLayer(), output, size);
  expect(x).toBeLessThanOrEqual(200);
  expect(y).toBeLessThanOrEqual(160);
  expect(x + width).toBeGreaterThanOrEqual(264);
  expect(y + height).toBeGreaterThanOrEqual(196);
  expect(
    bounds({ ...smallLayer(), rect: { x: 700, y: 400, width: 30, height: 20 } }, output, size)
  ).toEqual([1280, 720, 0, 0]);
});

it('retains full coverage when a group changes texture orientation', () => {
  const bounds = createGpuPreviewDrawBounds();
  const size = { width: 640, height: 360 };
  const source = { kind: 'group' as const, output: size, logical: size, layers: [smallLayer()] };
  expect(
    bounds({ ...smallLayer(), source, orientation: { rotation: 90, flip: true } }, size, size)
  ).toEqual([0, 0, 640, 360]);
});
