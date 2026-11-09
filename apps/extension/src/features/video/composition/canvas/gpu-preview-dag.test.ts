// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createGpuPreviewRenderer, type GpuPreviewRenderer } from './gpu-preview';
import type { GpuPreviewGroup, GpuPreviewLayer } from './gpu-preview-types';
import { graphics } from './gpu-preview.test-support';

let renderer: GpuPreviewRenderer | null = null;
afterEach(() => {
  renderer?.dispose();
  renderer = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([false, true])(
  'bounds shared DAG admission and preserves nested CSS filtering: %s',
  async (filtered) => {
    const mock = graphics();
    renderer = await createGpuPreviewRenderer();
    if (!renderer) throw new Error('Expected a GPU renderer.');
    const size = { width: 8, height: 8 };
    const draw = (source: GpuPreviewLayer['source']): GpuPreviewLayer => ({
      source,
      rect: { x: 0, y: 0, ...size },
      inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      opacity: 0.5,
    });
    const raster = Object.assign(document.createElement('canvas'), size);
    const leaf = draw(raster);
    const readFilter = vi.fn(() => (filtered ? { brightness: 0.9 } : undefined));
    Object.defineProperty(leaf, 'cssFilter', { get: readFilter });
    let group: GpuPreviewGroup = { kind: 'group', output: size, logical: size, layers: [leaf] };
    for (let depth = 0; depth < 6; depth++) {
      group = {
        kind: 'group',
        output: size,
        logical: size,
        layers: Array.from({ length: 8 }, () => draw(group)),
      };
    }
    const bitmap = await renderer.render({
      output: size,
      logical: size,
      layers: [draw(group)],
      signal: new AbortController().signal,
    });
    bitmap.close();
    // There are 50 unique layers, but more than 260,000 expanded leaf paths.
    expect(readFilter.mock.calls.length).toBeLessThanOrEqual(256);
    expect(mock.device.createComputePipelineAsync.mock.calls.length > 0).toBe(filtered);
  }
);
