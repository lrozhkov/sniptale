// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createGpuPreviewFilter, gpuPreviewFilterSupport } from './gpu-preview-filter';
import { graphics } from './gpu-preview.test-support';

const filters: Awaited<ReturnType<typeof createGpuPreviewFilter>>[] = [];
afterEach(() => {
  filters.splice(0).forEach((filter) => {
    filter.endFrame();
    filter.dispose();
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function filterOwner(reserve: (bytes: number) => { release(): void }) {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('Expected a GPU adapter.');
  const device = await adapter.requestDevice();
  const filter = await createGpuPreviewFilter(device, reserve);
  filters.push(filter);
  return { filter, device };
}

it('filters odd dimensions into native half-float mip views with independent immutable uniforms', async () => {
  const mock = graphics();
  const { filter, device } = await filterOwner(mock.reserve);
  const source = device.createTexture({ size: [5, 3], format: 'rgba8unorm', usage: 4 });
  const encoder = device.createCommandEncoder();
  filter.beginFrame();
  const result = filter.prepare(encoder, source, 'scene');
  expect(result).not.toBe(source);
  expect(mock.device.createTexture.mock.calls.at(-1)?.[0]).toMatchObject({
    size: [5, 3],
    format: 'rgba16float',
    mipLevelCount: 3,
  });
  expect(filter.allocatedBytes).toBe((5 * 3 + 2 * 1 + 1) * 8 + 3 * 16);
  const target = mock.device.createTexture.mock.results.at(-1);
  if (target?.type !== 'return') throw new Error('Expected a filter target.');
  expect(target.value.createView.mock.calls.map(([descriptor]) => descriptor)).toEqual([
    { baseMipLevel: 0, mipLevelCount: 1 },
    { baseMipLevel: 0, mipLevelCount: 1 },
    { baseMipLevel: 1, mipLevelCount: 1 },
    { baseMipLevel: 1, mipLevelCount: 1 },
    { baseMipLevel: 2, mipLevelCount: 1 },
  ]);
  const uniformValues = mock.queue.writeBuffer.mock.calls.map((call) => {
    const bytes: unknown = call[2];
    if (!(bytes instanceof ArrayBuffer)) throw new Error('Expected uniform bytes.');
    return {
      output: Array.from(new Float32Array(bytes, 0, 2)),
      mode: Array.from(new Uint32Array(bytes, 8, 2)),
    };
  });
  expect(uniformValues).toEqual([
    { output: [5, 3], mode: [0, 0] },
    { output: [2, 1], mode: [1, 0] },
    { output: [1, 1], mode: [1, 1] },
  ]);
  expect(new Set(mock.queue.writeBuffer.mock.calls.map((call) => call[0])).size).toBe(3);
  expect(mock.pass.draw).toHaveBeenCalledTimes(3);
  expect(mock.device.createRenderPipelineAsync.mock.calls[0]?.[0].fragment?.targets).toEqual([
    { format: 'rgba16float' },
  ]);
  filter.endFrame();
});

it('memoizes filter sources per frame, reuses targets and rejects conflicting sources', async () => {
  const mock = graphics();
  const { filter, device } = await filterOwner(mock.reserve);
  const first = device.createTexture({ size: [128, 64], format: 'rgba8unorm', usage: 4 });
  const second = device.createTexture({ size: [128, 64], format: 'rgba8unorm', usage: 4 });
  const encoder = device.createCommandEncoder();
  filter.beginFrame();
  const target = filter.prepare(encoder, first, 'scene');
  expect(filter.prepare(encoder, first, 'scene')).toBe(target);
  expect(mock.pass.draw).toHaveBeenCalledTimes(8);
  expect(() => filter.prepare(encoder, second, 'scene')).toThrow('conflicting sources');
  filter.endFrame();
  filter.beginFrame();
  expect(filter.prepare(encoder, second, 'scene')).toBe(target);
  expect(mock.pass.draw).toHaveBeenCalledTimes(16);
  expect(mock.device.createTexture).toHaveBeenCalledTimes(3);
  expect(mock.device.createBuffer).toHaveBeenCalledTimes(8);
  expect(mock.queue.writeBuffer).toHaveBeenCalledTimes(8);
  filter.endFrame();
});

it('releases unused filter targets only at endFrame and defers active disposal until drain', async () => {
  const mock = graphics();
  const { filter, device } = await filterOwner(mock.reserve);
  const source = device.createTexture({ size: [32, 16], format: 'rgba8unorm', usage: 4 });
  const encoder = device.createCommandEncoder();
  filter.beginFrame();
  filter.prepare(encoder, source, 'old');
  filter.endFrame();
  const old = mock.device.createTexture.mock.results.at(-1)?.value;
  filter.beginFrame();
  expect(old?.destroy).not.toHaveBeenCalled();
  filter.endFrame();
  expect(old?.destroy).toHaveBeenCalledOnce();
  expect(filter.allocatedBytes).toBe(0);
  filter.beginFrame();
  filter.prepare(encoder, source, 'new');
  const retained = mock.device.createTexture.mock.results.at(-1)?.value;
  filter.dispose();
  expect(retained?.destroy).not.toHaveBeenCalled();
  expect(() => filter.prepare(encoder, source, 'new')).toThrow('disposed');
  filter.endFrame();
  expect(retained?.destroy).toHaveBeenCalledOnce();
  expect(filter.allocatedBytes).toBe(0);
  for (const admission of mock.reserve.mock.results)
    expect(admission.value.release).toHaveBeenCalledOnce();
});

it('releases partially allocated filter resources and permits a fresh frame after allocation failure', async () => {
  const mock = graphics();
  const { filter, device } = await filterOwner(mock.reserve);
  const source = device.createTexture({ size: [32, 16], format: 'rgba8unorm', usage: 4 });
  const encoder = device.createCommandEncoder();
  mock.device.createBuffer.mockImplementationOnce(() => {
    throw new Error('buffer allocation failed');
  });
  filter.beginFrame();
  expect(() => filter.prepare(encoder, source, 'scene')).toThrow('buffer allocation failed');
  expect(filter.allocatedBytes).toBe(0);
  const failed = mock.device.createTexture.mock.results.at(-1)?.value;
  expect(failed?.destroy).toHaveBeenCalledOnce();
  filter.endFrame();
  filter.beginFrame();
  expect(filter.prepare(encoder, source, 'scene')).toBeTruthy();
  filter.endFrame();
  filter.dispose();
  expect(filter.allocatedBytes).toBe(0);
  for (const admission of mock.reserve.mock.results)
    expect(admission.value.release).toHaveBeenCalledOnce();
});

it('refuses filter allocations beyond the texture budget before allocating GPU storage', async () => {
  const mock = graphics();
  const { filter, device } = await filterOwner(mock.reserve);
  const source = device.createTexture({ size: [8192, 8192], format: 'rgba8unorm', usage: 4 });
  filter.beginFrame();
  expect(() => filter.prepare(device.createCommandEncoder(), source, 'large')).toThrow(
    'texture budget'
  );
  expect(mock.device.createTexture).toHaveBeenCalledOnce();
  expect(mock.reserve).not.toHaveBeenCalled();
  expect(filter.allocatedBytes).toBe(0);
  filter.endFrame();
});

it('bounds the actual reduction and cubic tap ancestry for odd and small mip dimensions', () => {
  for (const width of [5, 7, 31, 255, 513]) {
    const height = Math.max(1, width - 2);
    const dimensions = [{ width, height }];
    while (dimensions.length < 8) {
      const last = dimensions.at(-1)!;
      if (last.width === 1 && last.height === 1) break;
      dimensions.push({
        width: Math.max(1, Math.floor(last.width / 2)),
        height: Math.max(1, Math.floor(last.height / 2)),
      });
    }
    for (const axis of ['width', 'height'] as const) {
      const sizes = dimensions.map((size) => size[axis]);
      const ancestry = new Map<string, [number, number]>();
      const texels = (position: number, size: number) => [
        ...new Set(
          [Math.floor(position - 0.5), Math.floor(position - 0.5) + 1].map((index) =>
            Math.max(0, Math.min(size - 1, index))
          )
        ),
      ];
      const extent = (level: number, index: number): [number, number] => {
        if (level === 0) return [index + 0.5, index + 0.5];
        const key = `${level}:${index}`;
        const known = ancestry.get(key);
        if (known) return known;
        const point = ((index + 0.5) / sizes[level]!) * sizes[level - 1]! - 0.5;
        const base = Math.floor(point),
          phase = point - base;
        // Enumerate the shader's three bilinear taps, then follow their real input texels.
        const taps = [
          base - 1.5 + (4 - 3 * phase) / (5 - 4 * phase),
          base + 0.5 + (4 + 2 * phase) / 10,
          base + 2.5 + phase / (1 + 4 * phase),
        ];
        const inputs = taps
          .flatMap((tap) => texels(tap, sizes[level - 1]!))
          .map((input) => extent(level - 1, input));
        const value: [number, number] = [
          Math.min(...inputs.map((v) => v[0])),
          Math.max(...inputs.map((v) => v[1])),
        ];
        ancestry.set(key, value);
        return value;
      };
      for (let level = 0; level < sizes.length; level++) {
        const support = gpuPreviewFilterSupport({ width, height }, level);
        const margin = axis === 'width' ? support.x : support.y;
        for (let step = 0; step <= 200; step++) {
          const uv = step / 200;
          const pixel = uv * sizes[level]! - 0.5;
          const indices =
            level === 0
              ? texels(uv * sizes[0]!, sizes[0]!)
              : [-1, 0, 1, 2].map((offset) =>
                  Math.max(0, Math.min(sizes[level]! - 1, Math.floor(pixel) + offset))
                );
          for (const index of indices)
            for (const contributor of extent(level, index))
              expect(Math.abs(contributor - uv * sizes[0]!)).toBeLessThanOrEqual(margin);
        }
      }
    }
  }
});

it('reuses only confirmed mip contents and invalidates partial or unversioned writes', async () => {
  const mock = graphics();
  const { filter, device } = await filterOwner(mock.reserve);
  const source = device.createTexture({ size: [128, 64], format: 'rgba8unorm', usage: 4 });
  const render = (content: string | undefined, completed: boolean) => {
    filter.beginFrame();
    const result = filter.prepare(device.createCommandEncoder(), source, 'scene', content);
    filter.endFrame(completed);
    return result;
  };
  const target = render('a', true);
  expect(mock.pass.draw).toHaveBeenCalledTimes(8);
  expect(render('a', true)).toBe(target);
  expect(mock.pass.draw).toHaveBeenCalledTimes(8);
  render('b', false);
  expect(mock.pass.draw).toHaveBeenCalledTimes(16);
  render('b', true);
  expect(mock.pass.draw).toHaveBeenCalledTimes(24);
  render('b', true);
  expect(mock.pass.draw).toHaveBeenCalledTimes(24);
  render(undefined, true);
  expect(mock.pass.draw).toHaveBeenCalledTimes(32);
  render('b', true);
  expect(mock.pass.draw).toHaveBeenCalledTimes(40);
});

it('rejects conflicting content on the same source within a frame and defaults to unconfirmed completion', async () => {
  const mock = graphics(),
    { filter, device } = await filterOwner(mock.reserve);
  const source = device.createTexture({ size: [128, 64], format: 'rgba8unorm', usage: 4 });
  filter.beginFrame();
  filter.prepare(device.createCommandEncoder(), source, 'scene', 'a');
  expect(() => filter.prepare(device.createCommandEncoder(), source, 'scene', 'b')).toThrow(
    'conflicting'
  );
  filter.endFrame();
  filter.beginFrame();
  filter.prepare(device.createCommandEncoder(), source, 'scene', 'a');
  expect(mock.pass.draw).toHaveBeenCalledTimes(16);
  filter.endFrame(true);
});
