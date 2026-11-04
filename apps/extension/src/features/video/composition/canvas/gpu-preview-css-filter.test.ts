// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createGpuPreviewCssFilter } from './gpu-preview-css-filter';
import { createGpuPreviewRenderer } from './gpu-preview';
import { deferred, graphics } from './gpu-preview.test-support';

const owners: Awaited<ReturnType<typeof createGpuPreviewCssFilter>>[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) {
    owner.endFrame();
    owner.dispose();
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function fixture() {
  const mock = graphics();
  const compute = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: vi.fn(),
    end: vi.fn(),
  };
  const pipeline = vi.fn(async (_descriptor: GPUComputePipelineDescriptor) => ({
    getBindGroupLayout: vi.fn(() => ({})),
  }));
  Object.assign(mock.device, { createComputePipelineAsync: pipeline });
  const original = mock.device.createCommandEncoder();
  mock.device.createCommandEncoder.mockImplementation(() =>
    Object.assign(original, { beginComputePass: vi.fn(() => compute) })
  );
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('Expected GPU adapter.');
  const device = await adapter.requestDevice();
  const owner = await createGpuPreviewCssFilter(device, mock.reserve);
  owners.push(owner);
  const source = device.createTexture({ size: [129, 65], format: 'rgba8unorm', usage: 4 });
  return { mock, compute, pipeline, device, owner, source };
}

it('encodes the Skia odd/even three-box width and phase rule', async () => {
  const { mock, device, owner, source } = await fixture();
  for (const [sigma, widths] of [
    [0.5, [1, 1, 1]],
    [1, [2, 2, 3]],
    [2, [4, 4, 5]],
    [8, [15, 15, 15]],
  ] as const) {
    owner.beginFrame();
    owner.prepare(device.createCommandEncoder(), source, 'frame', { blur: sigma });
    const data: unknown = mock.queue.writeBuffer.mock.calls.at(-1)?.[2];
    if (!(data instanceof ArrayBuffer)) throw new Error('Expected uniform bytes.');
    expect([...new Uint32Array(data).slice(4, 7)]).toEqual(widths);
    owner.endFrame();
  }
});

it('bounds strip scratch and dispatch count independently of authored sigma', async () => {
  const { mock, compute, device, owner, source } = await fixture();
  owner.beginFrame();
  owner.prepare(device.createCommandEncoder(), source, 'frame', {
    blur: 32,
    brightness: 1.4,
    saturate: 0.6,
  });
  expect(compute.dispatchWorkgroups).toHaveBeenCalledTimes(
    (Math.ceil(129 / 16) + Math.ceil(65 / 16)) * 2
  );
  expect(mock.queue.writeBuffer.mock.calls).toHaveLength(14);
  expect(new Set(mock.queue.writeBuffer.mock.calls.map(([buffer]) => buffer)).size).toBe(14);
  expect(owner.allocatedBytes).toBe(129 * 65 * 16 + 129 * 16 * 96 + 14 * 48);
  owner.endFrame();
  compute.dispatchWorkgroups.mockClear();
  owner.beginFrame();
  owner.prepare(device.createCommandEncoder(), source, 'frame', { blur: Number.MAX_VALUE });
  expect(compute.dispatchWorkgroups).toHaveBeenCalledTimes(14);
  for (const call of mock.queue.writeBuffer.mock.calls.slice(-14)) {
    const data: unknown = call[2];
    if (!(data instanceof ArrayBuffer)) throw new Error('Expected uniform bytes.');
    expect(new Uint32Array(data)[10]).toBe(1);
  }
});

it('memoizes only identical source/settings and reuses resources across settled frames', async () => {
  const { mock, device, owner, source } = await fixture();
  owner.beginFrame();
  const output = owner.prepare(device.createCommandEncoder(), source, 'scene', { blur: 4 });
  const allocations = mock.device.createTexture.mock.calls.length;
  expect(owner.prepare(device.createCommandEncoder(), source, 'scene', { blur: 4 })).toBe(output);
  expect(() => owner.prepare(device.createCommandEncoder(), source, 'scene', { blur: 8 })).toThrow(
    'conflicting'
  );
  owner.endFrame();
  owner.beginFrame();
  expect(owner.prepare(device.createCommandEncoder(), source, 'scene', { blur: 8 })).toBe(output);
  expect(mock.device.createTexture).toHaveBeenCalledTimes(allocations);
  owner.endFrame();
  owner.beginFrame();
  owner.endFrame();
  expect(owner.allocatedBytes).toBe(0);
  const borrowed = mock.device.createTexture.mock.results[0];
  if (borrowed?.type !== 'return') throw new Error('Expected borrowed source.');
  expect(borrowed.value.destroy).not.toHaveBeenCalled();
});

it('defers active disposal and releases every admitted allocation exactly once after settlement', async () => {
  const { mock, device, owner, source } = await fixture();
  owner.beginFrame();
  owner.prepare(device.createCommandEncoder(), source, 'frame', {});
  const bytes = owner.allocatedBytes;
  owner.dispose();
  expect(owner.allocatedBytes).toBe(bytes);
  owner.endFrame();
  expect(owner.allocatedBytes).toBe(0);
  owner.dispose();
  expect(
    mock.reserve.mock.results.every(
      (result) => result.type === 'return' && result.value.release.mock.calls.length === 1
    )
  ).toBe(true);
});

it('releases partial allocation on failure and rejects invalid settings before allocating', async () => {
  const { mock, device, owner, source } = await fixture();
  owner.beginFrame();
  for (const settings of [{ blur: -1 }, { brightness: Infinity }, { saturate: NaN }])
    expect(() => owner.prepare(device.createCommandEncoder(), source, 'frame', settings)).toThrow(
      'settings'
    );
  expect(mock.reserve).not.toHaveBeenCalled();
  mock.device.createBuffer.mockImplementationOnce(() => {
    throw new Error('allocation failed');
  });
  expect(() => owner.prepare(device.createCommandEncoder(), source, 'frame', {})).toThrow(
    'allocation failed'
  );
  expect(owner.allocatedBytes).toBe(0);
  expect(
    mock.reserve.mock.results.every(
      (result) => result.type === 'return' && result.value.release.mock.calls.length === 1
    )
  ).toBe(true);
});

it('keeps CSS scratch alive through the renderer GPU fence when disposed in flight', async () => {
  const { mock } = await fixture();
  const renderer = await createGpuPreviewRenderer({ reserve: mock.reserve });
  if (!renderer) throw new Error('Expected GPU renderer.');
  const fence = deferred<void>();
  const submitted = deferred<void>();
  mock.queue.onSubmittedWorkDone.mockReturnValue(fence.promise);
  mock.queue.submit.mockImplementation(() => {
    submitted.resolve();
  });
  const source = document.createElement('canvas');
  source.width = 129;
  source.height = 65;
  const pending = renderer.render({
    output: { width: 129, height: 65 },
    logical: { width: 129, height: 65 },
    layers: [
      {
        source,
        rect: { x: 0, y: 0, width: 129, height: 65 },
        inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        cssFilter: { blur: 32 },
      },
    ],
    signal: new AbortController().signal,
  });
  await submitted.promise;
  renderer.dispose();
  expect(renderer.allocatedBytes).toBeGreaterThan(0);
  for (const result of mock.device.createTexture.mock.results)
    if (result.type === 'return') expect(result.value.destroy).not.toHaveBeenCalled();
  fence.resolve();
  await expect(pending).rejects.toThrow('disposed');
  expect(renderer.allocatedBytes).toBe(0);
  expect(mock.transfer).not.toHaveBeenCalled();
  expect(mock.device.popErrorScope).toHaveBeenCalledOnce();
  expect(
    mock.reserve.mock.results.every(
      (result) => result.type === 'return' && result.value.release.mock.calls.length === 1
    )
  ).toBe(true);
});
