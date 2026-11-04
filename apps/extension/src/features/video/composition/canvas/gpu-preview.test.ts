// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  createGpuPreviewRenderer,
  GpuPreviewDeviceError,
  type GpuPreviewGroup,
  type GpuPreviewLayer,
  type GpuPreviewRenderer,
} from './gpu-preview';
import { deferred, graphics } from './gpu-preview.test-support';

const owners: GpuPreviewRenderer[] = [];
afterEach(() => {
  owners.splice(0).forEach((owner) => owner.dispose());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function owner(args?: Parameters<typeof createGpuPreviewRenderer>[0]) {
  const renderer = await createGpuPreviewRenderer(args);
  if (!renderer) throw new Error('Expected a GPU renderer.');
  owners.push(renderer);
  return renderer;
}

function raster(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 18;
  return canvas;
}

function layer(source: GpuPreviewLayer['source'] = raster()): GpuPreviewLayer {
  return {
    source,
    rect: { x: 0, y: 0, width: 32, height: 18 },
    inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  };
}

function request(
  layers: readonly GpuPreviewLayer[] = [layer()],
  signal = new AbortController().signal
) {
  return { output: { width: 64, height: 36 }, logical: { width: 64, height: 36 }, layers, signal };
}

function group(layers: readonly GpuPreviewLayer[]): GpuPreviewGroup {
  return {
    kind: 'group',
    output: { width: 64, height: 36 },
    logical: { width: 64, height: 36 },
    layers,
  };
}

it('keeps the current preview when WebGPU or an adapter is unavailable', async () => {
  vi.stubGlobal('navigator', {});
  expect(await createGpuPreviewRenderer()).toBeNull();
  const { gpu, adapter } = graphics();
  gpu.requestAdapter.mockResolvedValue(null);
  expect(await createGpuPreviewRenderer()).toBeNull();
  expect(adapter.requestDevice).not.toHaveBeenCalled();
});

it('accepts fractional CSS scene dimensions while retaining integer output pixels', async () => {
  const g = graphics();
  const renderer = await owner();
  const frame = { ...request(), logical: { width: 678.5, height: 239.25 } };
  await expect(renderer.render(frame)).resolves.toBe(g.bitmap);
  await expect(renderer.render({ ...frame, output: { width: 64.5, height: 36 } })).rejects.toThrow(
    'dimensions'
  );
  await expect(
    renderer.render({ ...frame, logical: { width: Number.NaN, height: 36 } })
  ).rejects.toThrow('dimensions');
});

it('returns completed output without closing borrowed video or the returned bitmap', async () => {
  const { device, transfer, bitmap } = graphics();
  const renderer = await owner();
  const frame = new VideoFrame(raster());
  const result = await renderer.render(request([layer(frame)]));
  expect(device.importExternalTexture).toHaveBeenCalledWith({ source: frame });
  expect(device.queue.copyExternalImageToTexture).not.toHaveBeenCalled();
  expect(transfer).toHaveBeenCalledOnce();
  expect(result).toBe(bitmap);
  expect(frame.close).not.toHaveBeenCalled();
  renderer.dispose();
  expect(frame.close).not.toHaveBeenCalled();
  expect(bitmap.close).not.toHaveBeenCalled();
});

it('admits one frame in flight and reopens admission after completion', async () => {
  const { queue } = graphics();
  const fence = deferred<void>();
  queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
  const renderer = await owner();
  const first = renderer.render(request());
  await expect(renderer.render(request())).rejects.toThrow('frame in flight');
  expect(queue.submit).toHaveBeenCalledOnce();
  fence.resolve();
  await first;
  await renderer.render(request());
  expect(queue.submit).toHaveBeenCalledTimes(2);
});

it('does not publish an aborted frame after the GPU fence', async () => {
  const { queue, transfer } = graphics();
  const fence = deferred<void>();
  queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
  const renderer = await owner();
  const controller = new AbortController();
  const pending = renderer.render(request(undefined, controller.signal));
  controller.abort();
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  fence.resolve();
  await rejected;
  expect(transfer).not.toHaveBeenCalled();
  expect(queue.submit).toHaveBeenCalledOnce();
});

it('drains a pending frame before disposal and releases all admitted resources once', async () => {
  const { queue, device, reserve, transfer } = graphics();
  const fence = deferred<void>();
  queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
  const renderer = await owner({ reserve });
  const pending = renderer.render(request());
  renderer.dispose();
  renderer.dispose();
  expect(device.destroy).not.toHaveBeenCalled();
  expect(renderer.allocatedBytes).toBeGreaterThan(0);
  const rejected = expect(pending).rejects.toThrow('disposed');
  fence.resolve();
  await rejected;
  expect(transfer).not.toHaveBeenCalled();
  expect(device.destroy).toHaveBeenCalledOnce();
  expect(renderer.allocatedBytes).toBe(0);
  for (const admission of reserve.mock.results) {
    expect(admission.value.release).toHaveBeenCalledOnce();
  }
});

it('reuses unchanged raster textures and replaces them when their revision changes', async () => {
  const { queue, device } = graphics();
  const renderer = await owner();
  const plane = layer();
  plane.cache = { key: 'background', revision: 1 };
  await renderer.render(request([plane]));
  const first = device.createTexture.mock.results[0]?.value;
  await renderer.render(request([plane]));
  expect(queue.copyExternalImageToTexture).toHaveBeenCalledOnce();
  plane.cache = { key: 'background', revision: 2 };
  await renderer.render(request([plane]));
  expect(queue.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
  expect(first?.destroy).toHaveBeenCalledOnce();
  renderer.dispose();
  expect(first?.destroy).toHaveBeenCalledOnce();
});

it('rejects device loss before publishing a pending frame', async () => {
  const { queue, lost, transfer } = graphics();
  const fence = deferred<void>();
  queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
  const renderer = await owner();
  const pending = renderer.render(request());
  lost.resolve({ message: 'device removed' });
  fence.resolve();
  await expect(pending).rejects.toThrow('device removed');
  await expect(pending).rejects.toBeInstanceOf(GpuPreviewDeviceError);
  expect(transfer).not.toHaveBeenCalled();
  await expect(renderer.render(request())).rejects.toThrow('device removed');
});

it('balances GPU error scopes after an encoding failure and permits a later render', async () => {
  const { pass, device, queue, transfer } = graphics();
  const renderer = await owner();
  pass.draw.mockImplementationOnce(() => {
    throw new Error('encode failed');
  });
  await expect(renderer.render(request())).rejects.toThrow('encode failed');
  expect(queue.onSubmittedWorkDone).toHaveBeenCalledOnce();
  expect(device.popErrorScope).toHaveBeenCalledOnce();
  expect(transfer).not.toHaveBeenCalled();
  await renderer.render(request());
  expect(device.pushErrorScope).toHaveBeenCalledTimes(2);
  expect(device.popErrorScope).toHaveBeenCalledTimes(2);
  expect(transfer).toHaveBeenCalledOnce();
});

it('releases failed texture admission and retained resources on teardown', async () => {
  const { device, reserve } = graphics();
  const renderer = await owner({ reserve });
  device.createTexture.mockImplementationOnce(() => {
    throw new Error('allocation failed');
  });
  await expect(renderer.render(request())).rejects.toThrow('allocation failed');
  expect(reserve.mock.results.at(-1)?.value.release).toHaveBeenCalledOnce();
  renderer.dispose();
  expect(renderer.allocatedBytes).toBe(0);
  for (const admission of reserve.mock.results) {
    expect(admission.value.release).toHaveBeenCalledOnce();
  }
});

it('does not publish a validation-error frame', async () => {
  const { device, transfer } = graphics();
  const renderer = await owner();
  device.popErrorScope.mockResolvedValueOnce({ message: 'invalid texture binding' });
  const pending = renderer.render(request());
  await expect(pending).rejects.toThrow('invalid texture binding');
  await expect(pending).rejects.not.toBeInstanceOf(GpuPreviewDeviceError);
  expect(transfer).not.toHaveBeenCalled();
  expect(device.popErrorScope).toHaveBeenCalledOnce();
});

it('reports a rejected GPU fence as a device failure and reopens frame admission after cleanup', async () => {
  const { queue, device, transfer } = graphics();
  const fence = deferred<void>();
  queue.onSubmittedWorkDone.mockReturnValue(fence.promise);
  const renderer = await owner();
  const pending = renderer.render(request());
  const rejected = expect(pending).rejects.toBeInstanceOf(GpuPreviewDeviceError);
  fence.reject(new Error('queue rejected work'));
  await rejected;
  expect(transfer).not.toHaveBeenCalled();
  expect(device.popErrorScope).toHaveBeenCalledOnce();
  expect(device.pushErrorScope).toHaveBeenCalledOnce();
  queue.onSubmittedWorkDone.mockResolvedValue(undefined);
  await renderer.render(request());
  expect(device.pushErrorScope).toHaveBeenCalledTimes(2);
  expect(device.popErrorScope).toHaveBeenCalledTimes(2);
  expect(transfer).toHaveBeenCalledOnce();
});

it('settles deferred disposal and ledger cleanup when a pending GPU fence rejects', async () => {
  const { queue, device, reserve, transfer } = graphics();
  const fence = deferred<void>();
  queue.onSubmittedWorkDone.mockReturnValue(fence.promise);
  const renderer = await owner({ reserve });
  const pending = renderer.render(request([layer(group([layer()]))]));
  const rejected = expect(pending).rejects.toBeInstanceOf(GpuPreviewDeviceError);
  renderer.dispose();
  expect(device.destroy).not.toHaveBeenCalled();
  expect(renderer.allocatedBytes).toBeGreaterThan(0);
  fence.reject(new Error('device queue stopped'));
  await rejected;
  expect(transfer).not.toHaveBeenCalled();
  expect(device.popErrorScope).toHaveBeenCalledOnce();
  expect(device.destroy).toHaveBeenCalledOnce();
  expect(renderer.allocatedBytes).toBe(0);
  for (const admission of reserve.mock.results)
    expect(admission.value.release).toHaveBeenCalledOnce();
});

it('keeps invalid scene planning errors separate from GPU availability failures', async () => {
  const { queue, device } = graphics();
  const renderer = await owner();
  const invalid = { ...layer(), rect: { x: 0, y: 0, width: 0, height: 18 } };
  const rejected = renderer.render(request([invalid]));
  await expect(rejected).rejects.toThrow('geometry is unavailable');
  await expect(rejected).rejects.not.toBeInstanceOf(GpuPreviewDeviceError);
  expect(device.pushErrorScope).not.toHaveBeenCalled();
  expect(queue.submit).not.toHaveBeenCalled();
});

it.each(['internal', 'validation'] as const)(
  'classifies lazy effect pipeline %s failure without masking shader validation',
  async (reason) => {
    const { device, queue, transfer } = graphics();
    class PipelineFailure extends Error {
      constructor(readonly reason: GPUPipelineErrorReason) {
        super(`Pipeline ${reason} failure`);
      }
    }
    vi.stubGlobal('GPUPipelineError', PipelineFailure);
    const renderer = await owner();
    const failed = new PipelineFailure(reason);
    device.createRenderPipelineAsync.mockRejectedValueOnce(failed);
    const pending = renderer.render(request([{ ...layer(), blur: 2 }]));
    if (reason === 'internal') {
      await expect(pending).rejects.toBeInstanceOf(GpuPreviewDeviceError);
      await expect(pending).rejects.toMatchObject({ cause: failed });
    } else {
      await expect(pending).rejects.toBe(failed);
      await expect(pending).rejects.not.toBeInstanceOf(GpuPreviewDeviceError);
    }
    expect(queue.submit).not.toHaveBeenCalled();
    expect(transfer).not.toHaveBeenCalled();
    expect(device.popErrorScope).toHaveBeenCalledOnce();
    await renderer.render(request());
    expect(transfer).toHaveBeenCalledOnce();
  }
);

it('completes nested render passes before sampling each group in its parent', async () => {
  const { device, commands, queue } = graphics();
  const renderer = await owner();
  const nested = group([layer(group([layer()]))]);
  await renderer.render(request([layer(nested)]));
  expect(commands).toEqual([
    'begin',
    'draw',
    'end',
    'begin',
    'draw',
    'end',
    'begin',
    'draw',
    'end',
  ]);
  const encoded = device.createCommandEncoder.mock.results[0];
  if (encoded?.type !== 'return') throw new Error('Expected an encoded frame.');
  const attachments = encoded.value.beginRenderPass.mock.calls.map(
    ([descriptor]) => Array.from(descriptor.colorAttachments)[0]?.view
  );
  const textures = device.createTexture.mock.results.map((entry) => entry.value);
  expect(attachments).toEqual([
    { textureId: textures[1]?.textureId },
    { textureId: textures[0]?.textureId },
    expect.objectContaining({ textureId: expect.any(Number) }),
  ]);
  expect(queue.submit).toHaveBeenCalledOnce();
  expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledOnce();
});

it('renders a shared group once and uses separate additive and source-over pipelines', async () => {
  const { device, pass } = graphics();
  const renderer = await owner();
  const shared = group([layer()]);
  await renderer.render(
    request([{ ...layer(shared), blend: 'add', opacity: 0.25 }, layer(shared)])
  );
  const encoder = device.createCommandEncoder.mock.results[0]?.value;
  expect(encoder?.beginRenderPass).toHaveBeenCalledTimes(2);
  expect(pass.draw).toHaveBeenCalledTimes(3);
  expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledOnce();
  const pipelines = device.createRenderPipelineAsync.mock.results;
  expect(pass.setPipeline.mock.calls.map(([pipeline]) => pipeline)).toEqual([
    await pipelines[0]?.value,
    await pipelines[2]?.value,
    await pipelines[0]?.value,
  ]);
  const descriptors = device.createRenderPipelineAsync.mock.calls.map(([descriptor]) => descriptor);
  expect(descriptors[0]?.fragment?.targets).toEqual([
    expect.objectContaining({
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      },
    }),
  ]);
  expect(descriptors[2]?.fragment?.targets).toEqual([
    expect.objectContaining({
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one' },
        alpha: { srcFactor: 'one', dstFactor: 'one' },
      },
    }),
  ]);
});

it('rejects cyclic groups before allocating or submitting a partial scene', async () => {
  const { device, queue, transfer } = graphics();
  const renderer = await owner();
  const cycle: GpuPreviewGroup = group([]);
  cycle.layers = [layer(cycle)];
  await expect(renderer.render(request([layer(cycle)]))).rejects.toThrow('cycle');
  expect(device.createTexture).not.toHaveBeenCalled();
  expect(device.createBuffer).not.toHaveBeenCalled();
  expect(queue.submit).not.toHaveBeenCalled();
  expect(transfer).not.toHaveBeenCalled();
});

it('enforces aggregate layer and group-depth limits before submission', async () => {
  const { queue } = graphics();
  const renderer = await owner();
  const video = new VideoFrame(raster());
  const many = (last: number) =>
    Array.from({ length: 8 }, (_, index) =>
      layer(group(Array.from({ length: index === 7 ? last : 64 }, () => layer(video))))
    );
  await renderer.render(request(many(56)));
  expect(queue.submit).toHaveBeenCalledOnce();
  await expect(renderer.render(request(many(57)))).rejects.toThrow('budget');
  expect(queue.submit).toHaveBeenCalledOnce();
  let deep = layer(video);
  for (let index = 0; index < 16; index++) deep = layer(group([deep]));
  await renderer.render(request([deep]));
  expect(queue.submit).toHaveBeenCalledTimes(2);
  await expect(renderer.render(request([layer(group([deep]))]))).rejects.toThrow('budget');
  expect(queue.submit).toHaveBeenCalledTimes(2);
});

it('reuses group targets, releases omitted targets and releases retained resources on disposal', async () => {
  const { device, reserve } = graphics();
  const renderer = await owner({ reserve });
  const plane = layer();
  plane.cache = { key: 'retained', revision: 1 };
  const nested = group([plane]);
  const scene = request([layer(nested)]);
  await renderer.render(scene);
  const target = device.createTexture.mock.results[0]?.value;
  const initialBytes = renderer.allocatedBytes;
  await renderer.render(scene);
  expect(device.createTexture).toHaveBeenCalledTimes(2);
  expect(renderer.allocatedBytes).toBe(initialBytes);
  expect(target?.destroy).not.toHaveBeenCalled();
  await renderer.render(request([plane]));
  expect(target?.destroy).toHaveBeenCalledOnce();
  expect(renderer.allocatedBytes).toBe(initialBytes - 64 * 36 * 4);
  renderer.dispose();
  expect(renderer.allocatedBytes).toBe(0);
  for (const admission of reserve.mock.results)
    expect(admission.value.release).toHaveBeenCalledOnce();
});

it('retains a group target during an in-flight frame and releases it after disposal drains', async () => {
  const { queue, reserve, device } = graphics();
  const fence = deferred<void>();
  queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
  const renderer = await owner({ reserve });
  const pending = renderer.render(request([layer(group([layer()]))]));
  const target = device.createTexture.mock.results[0]?.value;
  renderer.dispose();
  expect(target?.destroy).not.toHaveBeenCalled();
  const rejected = expect(pending).rejects.toThrow('disposed');
  fence.resolve();
  await rejected;
  expect(target?.destroy).toHaveBeenCalledOnce();
  expect(renderer.allocatedBytes).toBe(0);
  for (const admission of reserve.mock.results)
    expect(admission.value.release).toHaveBeenCalledOnce();
});

it.each(['source', 'revision'] as const)(
  'rejects conflicting cache %s across groups before destroying retained textures',
  async (conflict) => {
    const { device, queue } = graphics();
    const renderer = await owner();
    const retained = layer();
    retained.cache = { key: 'shared-raster', revision: 1 };
    await renderer.render(request([retained]));
    const cached = device.createTexture.mock.results[0];
    if (cached?.type !== 'return') throw new Error('Expected a retained raster texture.');
    const replacement = layer(conflict === 'source' ? raster() : retained.source);
    replacement.cache = { key: 'shared-raster', revision: conflict === 'revision' ? 2 : 1 };
    await expect(renderer.render(request([retained, layer(group([replacement]))]))).rejects.toThrow(
      'cache key has conflicting sources'
    );
    expect(cached.value.destroy).not.toHaveBeenCalled();
    expect(queue.submit).toHaveBeenCalledOnce();
    expect(device.createTexture).toHaveBeenCalledOnce();
    await renderer.render(request([retained]));
    expect(queue.submit).toHaveBeenCalledTimes(2);
    expect(queue.copyExternalImageToTexture).toHaveBeenCalledOnce();
  }
);

it('binds an inline alpha mask in the source plane without orienting its coordinates', async () => {
  const { device, queue } = graphics();
  const renderer = await owner();
  const frame = new VideoFrame(raster());
  const mask = raster();
  const maskRect = { x: -12, y: 4, width: 64, height: 36 };
  await renderer.render(
    request([
      {
        ...layer(frame),
        inverse: [2, 0, -3, 0, 2, -6, 0, 0, 1],
        orientation: { rotation: 90, flip: true },
        alphaMask: { source: mask, rect: maskRect },
      },
    ])
  );
  const entries = device.createBindGroup.mock.calls.at(-1)?.[0].entries;
  expect(entries && Array.from(entries).map((entry) => entry.binding)).toEqual([0, 1, 2, 3]);
  expect(queue.copyExternalImageToTexture).toHaveBeenCalledWith(
    { source: mask },
    expect.anything(),
    [mask.width, mask.height]
  );
  const values: unknown = queue.writeBuffer.mock.calls.at(-1)?.[2];
  if (!(values instanceof Float32Array)) throw new Error('Expected layer uniforms.');
  expect(Array.from(values.slice(0, 12))).toEqual([2, 0, -3, 0, 0, 2, -6, 0, 0, 0, 1, 0]);
  expect(Array.from(values.slice(72, 76))).toEqual([-12, 4, 64, 36]);
  expect(frame.close).not.toHaveBeenCalled();
});

it('retains cached alpha mask pixels across frames and replaces their revision once', async () => {
  const { device, queue } = graphics();
  const renderer = await owner();
  const frame = new VideoFrame(raster());
  const mask = raster();
  const plane: GpuPreviewLayer = {
    ...layer(frame),
    alphaMask: {
      source: mask,
      rect: { x: 0, y: 0, width: 32, height: 18 },
      cache: { key: 'video-mask', revision: 1 },
    },
  };
  await renderer.render(request([plane]));
  await renderer.render(request([plane]));
  expect(queue.copyExternalImageToTexture).toHaveBeenCalledOnce();
  const first = device.createTexture.mock.results[0];
  if (first?.type !== 'return') throw new Error('Expected an alpha mask texture.');
  plane.alphaMask = {
    source: mask,
    rect: { x: 0, y: 0, width: 32, height: 18 },
    cache: { key: 'video-mask', revision: 2 },
  };
  await renderer.render(request([plane]));
  expect(queue.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
  expect(first.value.destroy).toHaveBeenCalledOnce();
  renderer.dispose();
  expect(mask.width).toBe(32);
  expect(mask.height).toBe(18);
  expect(frame.close).not.toHaveBeenCalled();
});

it('validates alpha mask cache conflicts with ordinary rasters before allocation', async () => {
  const { device, queue } = graphics();
  const renderer = await owner();
  const color = { ...layer(), cache: { key: 'shared-mask', revision: 1 } };
  const masked: GpuPreviewLayer = {
    ...layer(new VideoFrame(raster())),
    alphaMask: {
      source: raster(),
      rect: { x: 0, y: 0, width: 32, height: 18 },
      cache: { key: 'shared-mask', revision: 1 },
    },
  };
  const pending = renderer.render(request([color, layer(group([masked]))]));
  await expect(pending).rejects.toThrow('cache key has conflicting sources');
  await expect(pending).rejects.not.toBeInstanceOf(GpuPreviewDeviceError);
  expect(device.createTexture).not.toHaveBeenCalled();
  expect(queue.submit).not.toHaveBeenCalled();
});

it('retains alpha mask resources through a pending frame and releases them after disposal drains', async () => {
  const { device, queue, reserve, transfer } = graphics();
  const fence = deferred<void>();
  const submitted = deferred<void>();
  queue.onSubmittedWorkDone.mockReturnValue(fence.promise);
  queue.submit.mockImplementation(() => {
    submitted.resolve();
  });
  const renderer = await owner({ reserve });
  const frame = new VideoFrame(raster());
  const pending = renderer.render(
    request([
      {
        ...layer(frame),
        alphaMask: { source: raster(), rect: { x: 0, y: 0, width: 32, height: 18 } },
      },
    ])
  );
  await submitted.promise;
  const mask = device.createTexture.mock.results[0];
  if (mask?.type !== 'return') throw new Error('Expected an alpha mask texture.');
  renderer.dispose();
  expect(mask.value.destroy).not.toHaveBeenCalled();
  const rejected = expect(pending).rejects.toThrow('disposed');
  fence.resolve();
  await rejected;
  expect(mask.value.destroy).toHaveBeenCalledOnce();
  expect(transfer).not.toHaveBeenCalled();
  expect(frame.close).not.toHaveBeenCalled();
  expect(renderer.allocatedBytes).toBe(0);
  for (const admission of reserve.mock.results)
    expect(admission.value.release).toHaveBeenCalledOnce();
});

it('keeps ordinary unmasked work on its existing pipeline family and bindings', async () => {
  const { device } = graphics();
  const renderer = await owner();
  const pipelineCount = device.createRenderPipelineAsync.mock.calls.length;
  await renderer.render(request());
  expect(device.createRenderPipelineAsync).toHaveBeenCalledTimes(pipelineCount);
  expect(
    device.createBindGroup.mock.calls.every(
      ([descriptor]) => Array.from(descriptor.entries).length === 3
    )
  ).toBe(true);
});

it.each(['internal', 'validation'] as const)(
  'classifies lazy alpha-mask pipeline %s failure without masking invalid shaders',
  async (reason) => {
    const { device, queue, transfer } = graphics();
    class PipelineFailure extends Error {
      constructor(readonly reason: GPUPipelineErrorReason) {
        super(`Pipeline ${reason} failure`);
      }
    }
    vi.stubGlobal('GPUPipelineError', PipelineFailure);
    const renderer = await owner();
    const failed = new PipelineFailure(reason);
    device.createRenderPipelineAsync.mockRejectedValueOnce(failed);
    const pending = renderer.render(
      request([
        {
          ...layer(new VideoFrame(raster())),
          alphaMask: { source: raster(), rect: { x: 0, y: 0, width: 32, height: 18 } },
        },
      ])
    );
    if (reason === 'internal') {
      await expect(pending).rejects.toBeInstanceOf(GpuPreviewDeviceError);
      await expect(pending).rejects.toMatchObject({ cause: failed });
    } else {
      await expect(pending).rejects.toBe(failed);
      await expect(pending).rejects.not.toBeInstanceOf(GpuPreviewDeviceError);
    }
    expect(device.createTexture).not.toHaveBeenCalled();
    expect(queue.submit).not.toHaveBeenCalled();
    expect(transfer).not.toHaveBeenCalled();
    expect(device.popErrorScope).toHaveBeenCalledOnce();
  }
);

it('uses screen RGB and source-atop alpha coefficients without changing source-over', async () => {
  const mock = graphics();
  const renderer = await owner();
  await renderer.render(
    request([
      { ...layer(), blend: 'screen' },
      { ...layer(), blend: 'atop' },
    ])
  );
  const targets = mock.device.createRenderPipelineAsync.mock.calls.map(
    ([descriptor]) => descriptor.fragment?.targets
  );
  expect(targets[8]).toEqual([
    {
      format: 'bgra8unorm',
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      },
    },
  ]);
  expect(targets[10]).toEqual([
    {
      format: 'bgra8unorm',
      blend: {
        color: { srcFactor: 'dst-alpha', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'dst-alpha', dstFactor: 'one-minus-src-alpha' },
      },
    },
  ]);
});

it('retains operation coverage separately from source alpha masks and tint uniforms', async () => {
  const mock = graphics();
  const renderer = await owner({ reserve: mock.reserve });
  const coverage = raster();
  const source = raster();
  const plan = request([
    {
      ...layer(source),
      tint: [0.2, 0.4, 0.6, 0.5],
      blend: 'mask',
      operationClip: { source: coverage, cache: { key: 'operation', revision: 1 } },
    },
  ]);
  await renderer.render(plan);
  expect(
    mock.device.createBindGroup.mock.calls.at(-1)?.[0].entries.map((entry) => entry.binding)
  ).toEqual([0, 1, 2, 4]);
  const values: unknown = mock.queue.writeBuffer.mock.calls.at(-1)?.[2];
  if (!(values instanceof Float32Array)) throw new Error('Expected layer uniforms.');
  expect([...values.slice(76, 80)]).toEqual([
    Math.fround(0.2),
    Math.fround(0.4),
    Math.fround(0.6),
    0.5,
  ]);
  expect(values[80]).toBe(1);
  await renderer.render(plan);
  expect(
    mock.queue.copyExternalImageToTexture.mock.calls.filter(([input]) => input.source === coverage)
  ).toHaveLength(1);
  await expect(
    renderer.render(
      request([
        {
          ...layer(),
          operationClip: { source: coverage, cache: { key: 'conflict', revision: 1 } },
        },
        { ...layer(source), cache: { key: 'conflict', revision: 1 } },
      ])
    )
  ).rejects.toThrow('conflicting');
  renderer.dispose();
  expect(renderer.allocatedBytes).toBe(0);
});

it.each(['internal', 'validation'] as const)(
  'classifies lazy CSS compute pipeline %s failure and balances the transaction',
  async (reason) => {
    const mock = graphics();
    class PipelineFailure extends Error {
      constructor(readonly reason: GPUPipelineErrorReason) {
        super(`Pipeline ${reason} failure`);
      }
    }
    vi.stubGlobal('GPUPipelineError', PipelineFailure);
    const failed = new PipelineFailure(reason);
    Object.assign(mock.device, {
      createComputePipelineAsync: vi.fn(async () => {
        throw failed;
      }),
    });
    const renderer = await owner({ reserve: mock.reserve });
    const pending = renderer.render(request([{ ...layer(), cssFilter: { blur: 8 } }]));
    if (reason === 'internal') await expect(pending).rejects.toBeInstanceOf(GpuPreviewDeviceError);
    else {
      await expect(pending).rejects.toBe(failed);
      await expect(pending).rejects.not.toBeInstanceOf(GpuPreviewDeviceError);
    }
    expect(mock.device.popErrorScope).toHaveBeenCalledOnce();
    expect(mock.queue.submit).not.toHaveBeenCalled();
    expect(mock.transfer).not.toHaveBeenCalled();
    expect(renderer.allocatedBytes).toBe(0);
    await expect(renderer.render(request())).resolves.toBe(mock.bitmap);
  }
);

it.each(['scope-first', 'fence-first'] as const)(
  'starts scope completion beside the submitted-work fence and waits for both: %s',
  async (order) => {
    const { device, queue, transfer, bitmap } = graphics();
    const fence = deferred<void>(),
      scope = deferred<{ message: string } | null>();
    queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
    device.popErrorScope.mockReturnValueOnce(scope.promise);
    const renderer = await owner();
    const pending = renderer.render(request());
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    try {
      await Promise.resolve();
      expect(device.popErrorScope).toHaveBeenCalledOnce();
      expect(queue.submit).toHaveBeenCalledOnce();
      if (order === 'scope-first') scope.resolve(null);
      else fence.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(transfer).not.toHaveBeenCalled();
      await expect(renderer.render(request())).rejects.toThrow('frame in flight');
      if (order === 'scope-first') fence.resolve();
      else scope.resolve(null);
      await expect(pending).resolves.toBe(bitmap);
      expect(transfer).toHaveBeenCalledOnce();
      expect(device.popErrorScope).toHaveBeenCalledOnce();
      expect(queue.onSubmittedWorkDone).toHaveBeenCalledOnce();
    } finally {
      fence.resolve();
      scope.resolve(null);
      await pending.catch(() => {});
    }
  }
);

it.each(['fence-reject', 'scope-reject', 'validation', 'sync-pop', 'both-reject'] as const)(
  'holds the opposite completion barrier before reporting %s',
  async (mode) => {
    const { device, queue, transfer } = graphics();
    const fence = deferred<void>(),
      scope = deferred<{ message: string } | null>();
    const fenceFailure = new Error('queue completion failed'),
      scopeFailure = new Error('scope completion failed');
    queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
    if (mode === 'sync-pop')
      device.popErrorScope.mockImplementationOnce(() => {
        throw scopeFailure;
      });
    else device.popErrorScope.mockReturnValueOnce(scope.promise);
    const renderer = await owner(),
      pending = renderer.render(request());
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    try {
      await Promise.resolve();
      expect(device.popErrorScope).toHaveBeenCalledOnce();
      if (mode === 'fence-reject' || mode === 'both-reject') fence.reject(fenceFailure);
      else if (mode === 'scope-reject') scope.reject(scopeFailure);
      else if (mode === 'validation') scope.resolve({ message: 'invalid submitted frame' });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(transfer).not.toHaveBeenCalled();
      await expect(renderer.render(request())).rejects.toThrow('frame in flight');
      if (mode === 'fence-reject') scope.resolve(null);
      else if (mode === 'both-reject') scope.reject(scopeFailure);
      else fence.resolve();
      if (mode === 'fence-reject' || mode === 'both-reject') {
        await expect(pending).rejects.toBeInstanceOf(GpuPreviewDeviceError);
        await expect(pending).rejects.toMatchObject({ cause: fenceFailure });
      } else if (mode === 'validation') {
        await expect(pending).rejects.toThrow('invalid submitted frame');
        await expect(pending).rejects.not.toBeInstanceOf(GpuPreviewDeviceError);
      } else await expect(pending).rejects.toBe(scopeFailure);
      expect(transfer).not.toHaveBeenCalled();
      expect(device.popErrorScope).toHaveBeenCalledOnce();
      expect(queue.onSubmittedWorkDone).toHaveBeenCalledOnce();
      await renderer.render(request());
      expect(transfer).toHaveBeenCalledOnce();
    } finally {
      fence.resolve();
      scope.resolve(null);
      await pending.catch(() => {});
    }
  }
);

it.each([
  ['abort', 'scope-first'],
  ['abort', 'fence-first'],
  ['dispose', 'scope-first'],
  ['dispose', 'fence-first'],
] as const)(
  'retains submitted resources until both barriers settle after %s (%s)',
  async (action, order) => {
    const { device, queue, reserve, transfer } = graphics();
    const fence = deferred<void>(),
      scope = deferred<{ message: string } | null>();
    queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
    device.popErrorScope.mockReturnValueOnce(scope.promise);
    const renderer = await owner({ reserve }),
      controller = new AbortController();
    const frame = new VideoFrame(raster());
    const pending = renderer.render(request([layer(frame)], controller.signal));
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    try {
      await Promise.resolve();
      expect(device.popErrorScope).toHaveBeenCalledOnce();
      if (action === 'abort') controller.abort();
      else {
        renderer.dispose();
        renderer.dispose();
      }
      if (order === 'scope-first') scope.resolve(null);
      else fence.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(transfer).not.toHaveBeenCalled();
      expect(device.destroy).not.toHaveBeenCalled();
      expect(renderer.allocatedBytes).toBeGreaterThan(0);
      expect(frame.close).not.toHaveBeenCalled();
      if (order === 'scope-first') fence.resolve();
      else scope.resolve(null);
      if (action === 'abort') await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      else await expect(pending).rejects.toThrow('disposed');
      expect(transfer).not.toHaveBeenCalled();
      expect(device.popErrorScope).toHaveBeenCalledOnce();
      renderer.dispose();
      expect(device.destroy).toHaveBeenCalledOnce();
      expect(renderer.allocatedBytes).toBe(0);
      for (const admission of reserve.mock.results)
        expect(admission.value.release).toHaveBeenCalledOnce();
      expect(frame.close).not.toHaveBeenCalled();
    } finally {
      fence.resolve();
      scope.resolve(null);
      await pending.catch(() => {});
      frame.close();
    }
  }
);
