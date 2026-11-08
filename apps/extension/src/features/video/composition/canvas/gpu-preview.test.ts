// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  createGpuPreviewRenderer,
  GpuPreviewDeviceError,
  GPU_PREVIEW_UNIFORM_BYTES,
  type GpuPreviewGroup,
  type GpuPreviewLayer,
  type GpuPreviewRenderer,
} from './gpu-preview';
import { deferred, graphics } from './gpu-preview.test-support';
import { gpuPreviewShader } from './gpu-preview-shaders';

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

it('notifies submission once after queue submit while the completion fence remains pending', async () => {
  const g = graphics();
  const fence = deferred<void>();
  g.queue.onSubmittedWorkDone.mockReturnValue(fence.promise);
  const renderer = await owner();
  const submitted = vi.fn();
  const pending = renderer.render({ ...request(), onSubmitted: submitted });
  try {
    await vi.waitFor(() => expect(g.queue.submit).toHaveBeenCalledOnce());
    expect(submitted).toHaveBeenCalledOnce();
    expect(g.queue.submit.mock.invocationCallOrder[0]!).toBeLessThan(
      submitted.mock.invocationCallOrder[0]!
    );
    expect(g.transfer).not.toHaveBeenCalled();
  } finally {
    fence.resolve(undefined);
    await pending;
  }
});

it('drains submitted work and validation before retiring a throwing submission callback', async () => {
  const g = graphics();
  const fence = deferred<void>(),
    scope = deferred<GPUError | null>();
  g.queue.onSubmittedWorkDone.mockReturnValue(fence.promise);
  g.device.popErrorScope.mockReturnValue(scope.promise);
  const renderer = await owner();
  const failure = new Error('submission callback failed');
  const pending = renderer.render({
    ...request(),
    onSubmitted: () => {
      throw failure;
    },
  });
  let settled = false;
  void pending.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  await vi.waitFor(() => expect(g.queue.submit).toHaveBeenCalledOnce());
  renderer.dispose();
  expect(settled).toBe(false);
  expect(g.device.destroy).not.toHaveBeenCalled();
  fence.resolve(undefined);
  await vi.waitFor(() => expect(g.device.popErrorScope).toHaveBeenCalledOnce());
  expect(settled).toBe(false);
  expect(g.device.destroy).not.toHaveBeenCalled();
  scope.resolve(null);
  await expect(pending).rejects.toBe(failure);
  expect(g.transfer).not.toHaveBeenCalled();
  expect(renderer.allocatedBytes).toBe(0);
  expect(g.device.destroy).toHaveBeenCalledOnce();
});

it('uploads one borrowed unkeyed raster once across layers groups and alpha masks', async () => {
  const g = graphics();
  const renderer = await owner({ reserve: g.reserve });
  const source = raster();
  const masked = {
    ...layer(),
    alphaMask: { source, rect: layer(source).rect },
    operationClip: { source },
  };
  await renderer.render(request([layer(source), layer(group([layer(source)])), masked]));
  expect(
    g.queue.copyExternalImageToTexture.mock.calls.filter(([input]) => input.source === source)
  ).toHaveLength(1);
  expect(g.pass.draw).toHaveBeenCalledTimes(4);
  renderer.dispose();
  expect(renderer.allocatedBytes).toBe(0);
});

it('uploads a borrowed unkeyed raster again on the next frame', async () => {
  const g = graphics();
  const renderer = await owner();
  const source = raster();
  const input = request([layer(source), layer(source)]);
  await renderer.render(input);
  await renderer.render(input);
  expect(g.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
});

it('keeps explicit raster revisions separate from per-frame unkeyed sharing', async () => {
  const g = graphics();
  const renderer = await owner();
  const source = raster();
  const input = request([
    layer(source),
    layer(source),
    { ...layer(source), cache: { key: 'retained-raster', revision: 1 } },
  ]);
  await renderer.render(input);
  expect(g.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
  await renderer.render(input);
  expect(g.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(3);
});

function nativeFrames() {
  const frames: NativeFrame[] = [];
  const layout = [
    { offset: 0, stride: 32 },
    { offset: 576, stride: 32 },
  ];
  const copy = vi.fn<VideoFrame['copyTo']>(async () => layout);
  class NativeFrame {
    format: VideoPixelFormat;
    codedWidth: number;
    codedHeight: number;
    displayWidth: number;
    displayHeight: number;
    timestamp: number;
    duration: number;
    colorSpace: VideoColorSpaceInit;
    visibleRect: { x: number; y: number; width: number; height: number };
    close = vi.fn();
    clone = vi.fn(() => new NativeFrame());
    copyTo = copy;
    allocationSize = vi.fn(() => 864);
    constructor(_source?: unknown, init?: VideoFrameBufferInit) {
      this.format = init?.format ?? 'NV12';
      this.codedWidth = init?.codedWidth ?? 32;
      this.codedHeight = init?.codedHeight ?? 32;
      this.displayWidth = init?.displayWidth ?? 32;
      this.displayHeight = init?.displayHeight ?? 18;
      this.timestamp = init?.timestamp ?? 1_000_000;
      this.duration = init?.duration ?? 33_333;
      this.colorSpace = init?.colorSpace ?? { matrix: 'bt709', fullRange: false };
      this.visibleRect = {
        x: 0,
        y: 0,
        width: this.codedWidth,
        height: init ? this.codedHeight : 18,
      };
      frames.push(this);
    }
  }
  vi.stubGlobal('VideoFrame', NativeFrame);
  return { frames, copy, layout };
}

it('converts one borrowed padded NV12 source once on GPU without CPU copies', async () => {
  const g = graphics();
  const native = nativeFrames();
  const renderer = await owner({ reserve: g.reserve });
  const source = new VideoFrame(raster());
  const fence = deferred<void>();
  g.queue.onSubmittedWorkDone.mockReturnValue(fence.promise);
  const drawing = renderer.render(request([layer(source), layer(group([layer(source)]))]));
  await vi.waitFor(() => expect(g.queue.submit).toHaveBeenCalledOnce());
  expect(native.copy.mock.calls.length).toBe(0);
  expect(native.frames).toHaveLength(1);
  expect(native.frames[0]!.clone).not.toHaveBeenCalled();
  expect(g.device.importExternalTexture).toHaveBeenCalledExactlyOnceWith({ source });
  const nativeTarget = g.device.createTexture.mock.results.find(
    (result) => result.type === 'return' && result.value.width === 32 && result.value.height === 18
  )?.value;
  expect(nativeTarget).toBeDefined();
  expect(nativeTarget!.destroy).not.toHaveBeenCalled();
  expect(g.reserve).toHaveBeenCalledWith(32 * 18 * 4);
  expect(native.frames[0]!.close).not.toHaveBeenCalled();
  fence.resolve(undefined);
  expect(await drawing).toBe(g.bitmap);
  expect(native.frames[0]!.close).not.toHaveBeenCalled();
  renderer.dispose();
  expect(nativeTarget!.destroy).toHaveBeenCalledOnce();
  expect(renderer.allocatedBytes).toBe(0);
});

it.each(['NV12', 'I420'] as const)(
  'does not copy %s frames without affected native padding',
  async (format) => {
    const g = graphics();
    const native = nativeFrames();
    const renderer = await owner();
    const source = new VideoFrame(raster());
    native.frames[0]!.format = format;
    if (format === 'NV12') native.frames[0]!.codedHeight = 18;
    await renderer.render(request([layer(source)]));
    expect(g.device.importExternalTexture).toHaveBeenCalledWith({ source });
    expect(native.frames[0]!.clone).not.toHaveBeenCalled();
    expect(native.copy.mock.calls.length).toBe(0);
    expect(native.frames[0]!.close).not.toHaveBeenCalled();
  }
);

it.each(['abort', 'dispose', 'queue failure'] as const)(
  'retains native RGB storage through GPU settlement after %s',
  async (ending) => {
    const g = graphics();
    const native = nativeFrames();
    const renderer = await owner({ reserve: g.reserve });
    const source = new VideoFrame(raster());
    const controller = new AbortController();
    const fence = deferred<void>();
    g.queue.onSubmittedWorkDone.mockReturnValue(fence.promise);
    const outcome = renderer
      .render(request([layer(source)], controller.signal))
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(g.queue.submit).toHaveBeenCalledOnce());
    const target = g.device.createTexture.mock.results.find(
      (result) =>
        result.type === 'return' && result.value.width === 32 && result.value.height === 18
    )!.value;
    if (ending === 'abort') controller.abort();
    if (ending === 'dispose') renderer.dispose();
    expect(target.destroy).not.toHaveBeenCalled();
    if (ending === 'queue failure') fence.reject(new Error('Lost queue'));
    else fence.resolve(undefined);
    expect(await outcome).toBeInstanceOf(Error);
    expect(native.copy.mock.calls.length).toBe(0);
    expect(native.frames).toHaveLength(1);
    expect(native.frames[0]!.close).not.toHaveBeenCalled();
    expect(g.transfer).not.toHaveBeenCalled();
    renderer.dispose();
    expect(target.destroy).toHaveBeenCalledOnce();
    expect(renderer.allocatedBytes).toBe(0);
  }
);

it.each(['abort', 'import failure'] as const)(
  'preserves the borrowed native source on preparation %s',
  async (ending) => {
    const g = graphics();
    const native = nativeFrames();
    const renderer = await owner({ reserve: g.reserve });
    const source = new VideoFrame(raster());
    const controller = new AbortController();
    if (ending === 'abort') controller.abort();
    else
      g.device.importExternalTexture.mockImplementationOnce(() => {
        throw new Error('Native import failed');
      });
    await expect(renderer.render(request([layer(source)], controller.signal))).rejects.toThrow();
    expect(native.frames).toHaveLength(1);
    expect(native.frames[0]!.clone).not.toHaveBeenCalled();
    expect(native.frames[0]!.close).not.toHaveBeenCalled();
    expect(native.copy.mock.calls.length).toBe(0);
    expect(g.device.importExternalTexture).toHaveBeenCalledTimes(ending === 'abort' ? 0 : 1);
    expect(g.queue.submit).not.toHaveBeenCalled();
    expect(g.transfer).not.toHaveBeenCalled();
    renderer.dispose();
    expect(renderer.allocatedBytes).toBe(0);
  }
);

it.each(['budget', 'reservation'] as const)(
  'refuses GPU native storage on %s failure without CPU allocation',
  async (failure) => {
    const g = graphics();
    const native = nativeFrames();
    const renderer = await owner({ reserve: g.reserve });
    const sources = [new VideoFrame(raster()), new VideoFrame(raster())];
    if (failure === 'budget')
      for (const frame of native.frames) {
        frame.displayWidth = 8192;
        frame.displayHeight = 8192;
      }
    else
      g.reserve.mockImplementation(() => {
        throw new Error('Reservation refused');
      });
    await expect(renderer.render(request(sources.map((source) => layer(source))))).rejects.toThrow(
      failure === 'budget' ? 'texture budget' : 'Reservation refused'
    );
    expect(native.copy.mock.calls.length).toBe(0);
    expect(native.frames).toHaveLength(2);
    for (const frame of native.frames) {
      expect(frame.clone).not.toHaveBeenCalled();
      expect(frame.close).not.toHaveBeenCalled();
    }
    expect(g.queue.submit).not.toHaveBeenCalled();
    expect(g.transfer).not.toHaveBeenCalled();
    renderer.dispose();
    expect(renderer.allocatedBytes).toBe(0);
  }
);

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
  await vi.waitFor(() => expect(queue.submit).toHaveBeenCalledOnce());
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
  await vi.waitFor(() => expect(queue.submit).toHaveBeenCalledOnce());
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
  await vi.waitFor(() => expect(queue.submit).toHaveBeenCalledOnce());
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
  const calls = device.createRenderPipelineAsync.mock.calls;
  const over = calls.findIndex(([descriptor]) =>
    Array.from(descriptor.fragment?.targets ?? []).some(
      (target) => target?.blend?.color.dstFactor === 'one-minus-src-alpha'
    )
  );
  const add = calls.findIndex(([descriptor]) =>
    Array.from(descriptor.fragment?.targets ?? []).some(
      (target) => target?.blend?.color.dstFactor === 'one'
    )
  );
  const pipelines = device.createRenderPipelineAsync.mock.results;
  expect(pass.setPipeline.mock.calls.map(([pipeline]) => pipeline)).toEqual([
    await pipelines[over]?.value,
    await pipelines[add]?.value,
    await pipelines[over]?.value,
  ]);
  const descriptors = [calls[over]?.[0], calls[add]?.[0]];
  expect(descriptors[0]?.fragment?.targets).toEqual([
    expect.objectContaining({
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      },
    }),
  ]);
  expect(descriptors[1]?.fragment?.targets).toEqual([
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
  await vi.waitFor(() => expect(queue.submit).toHaveBeenCalledOnce());
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

it.each([
  { edges: undefined, flags: 0 },
  { edges: ['bottom'] as const, flags: 8 },
  { edges: ['left', 'top', 'right', 'bottom'] as const, flags: 15 },
])(
  'packs source edge coverage $flags without changing mask or orientation coordinates',
  async ({ edges, flags }) => {
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
          ...(edges ? { clampSourceEdges: edges } : {}),
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
    expect(Array.from(values.slice(68, 72))).toEqual([expect.closeTo(0), 1, 1, flags]);
    expect(frame.close).not.toHaveBeenCalled();
  }
);

it.each([null, true, 'bottom', ['unknown'], ['bottom', null]])(
  'rejects malformed source edge coverage before submission: %j',
  async (edges) => {
    const g = graphics();
    const renderer = await owner();
    const source = layer();
    Reflect.set(source, 'clampSourceEdges', edges);
    await expect(renderer.render(request([source]))).rejects.toThrow('source edges');
    expect(g.queue.submit).not.toHaveBeenCalled();
    expect(g.queue.copyExternalImageToTexture).not.toHaveBeenCalled();
  }
);

it('packs an exact source-plane rectangle without changing uniform storage', async () => {
  const { queue } = graphics();
  const renderer = await owner();
  const source = layer();
  source.clip = {
    rect: { x: 2.3, y: 3.7, width: 20, height: 12 },
    radius: 0,
    shape: 'hard-rect',
  };
  await renderer.render(request([source]));
  const values: unknown = queue.writeBuffer.mock.calls.at(-1)?.[2];
  if (!(values instanceof Float32Array)) throw new Error('Expected layer uniforms.');
  expect(values.byteLength).toBe(GPU_PREVIEW_UNIFORM_BYTES);
  expect(Array.from(values.slice(24, 28))).toEqual([0, 1, 1, 2]);
});

it('rejects rounded geometry for an exact source-plane rectangle', async () => {
  const g = graphics();
  const renderer = await owner();
  const source = layer();
  source.clip = { rect: source.rect, radius: 2, shape: 'hard-rect' };
  await expect(renderer.render(request([source]))).rejects.toThrow('geometry');
  expect(g.queue.submit).not.toHaveBeenCalled();
  expect(g.queue.copyExternalImageToTexture).not.toHaveBeenCalled();
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
  await renderer.render(request());
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
  const targets = mainPipelineCalls(mock).map(([descriptor]) => descriptor.fragment?.targets);
  expect(targets[0]).toEqual([
    {
      format: 'bgra8unorm',
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      },
    },
  ]);
  expect(targets[1]).toEqual([
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
      await vi.waitFor(() => expect(device.popErrorScope).toHaveBeenCalledOnce());
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
      await vi.waitFor(() => expect(device.popErrorScope).toHaveBeenCalledOnce());
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
      await vi.waitFor(() => expect(device.popErrorScope).toHaveBeenCalledOnce());
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

function fullGroup(source: GpuPreviewGroup): GpuPreviewLayer {
  return { ...layer(source), rect: { x: 0, y: 0, width: 64, height: 36 } };
}

it('omits the leading identity group target and copy while preserving later layer order', async () => {
  const g = graphics();
  const renderer = await owner();
  const child = raster(),
    later = raster();
  const leading = group([layer(child)]);
  const wrapped = fullGroup(leading);
  await renderer.render(request([wrapped, layer(later)]));
  expect(g.commands.filter((command) => command === 'begin')).toHaveLength(1);
  expect(g.pass.draw).toHaveBeenCalledTimes(2);
  expect(g.device.createTexture.mock.calls.map(([descriptor]) => descriptor.size)).toEqual([
    [32, 18],
    [32, 18],
  ]);
  expect(
    g.queue.copyExternalImageToTexture.mock.calls.map(([descriptor]) => descriptor.source)
  ).toEqual([child, later]);
  expect(wrapped.source).toBe(leading);
  expect(leading.layers).toHaveLength(1);
});

function writtenRectWidths(g: ReturnType<typeof graphics>) {
  return g.queue.writeBuffer.mock.calls.map((call) => {
    const values: unknown = call[2];
    if (!(values instanceof Float32Array)) throw new Error('Expected layer uniforms.');
    return values[18];
  });
}

it('keeps child blend commands on a transparent destination before subsequent parent layers', async () => {
  const g = graphics();
  const renderer = await owner();
  const blends = ['over', 'add', 'mask', 'erase', 'screen', 'atop'] as const;
  const leading = group(blends.map((blend) => ({ ...layer(), blend })));
  await renderer.render(request([fullGroup(leading), layer()]));
  expect(g.commands.filter((command) => command === 'begin')).toHaveLength(1);
  expect(g.pass.draw).toHaveBeenCalledTimes(7);
  const pipelines = await Promise.all(
    g.device.createRenderPipelineAsync.mock.results.slice(1).map((result) => result.value)
  );
  // Normalization visits the child blend commands in their preserved draw order.
  expect(g.pass.setPipeline.mock.calls.map((call) => call[0])).toEqual(
    [0, 1, 2, 3, 4, 5, 0].map((index) => pipelines[index])
  );
});

it('removes nested private leading copies without changing the source graph', async () => {
  const g = graphics();
  const renderer = await owner();
  const inner = group([layer()]);
  const outer = group([fullGroup(inner)]);
  await renderer.render(request([fullGroup(outer)]));
  expect(g.commands.filter((command) => command === 'begin')).toHaveLength(1);
  expect(g.pass.draw).toHaveBeenCalledOnce();
  expect(outer.layers[0]!.source).toBe(inner);
});

it('omits a same-grid leading group copy with cancelling integer source-plane offsets', async () => {
  const g = graphics();
  const renderer = await owner();
  const inner = group([layer()]);
  const copy: GpuPreviewLayer = {
    ...fullGroup(inner),
    rect: { x: -8, y: -12, width: 64, height: 36 },
    inverse: [1, 0, -8, 0, 1, -12, 0, 0, 1],
  };
  const outer = group([copy]);
  await renderer.render(request([layer(), fullGroup(outer)]));
  expect(g.commands.filter((command) => command === 'begin')).toHaveLength(2);
  expect(g.pass.draw).toHaveBeenCalledTimes(3);
  expect(outer.layers[0]).toBe(copy);
  expect(copy.source).toBe(inner);
});

it.each<{ name: string; inverse: GpuPreviewLayer['inverse']; x: number }>([
  { name: 'uncancelled offset', inverse: [1, 0, -7, 0, 1, -12, 0, 0, 1], x: -8 },
  { name: 'fractional offset', inverse: [1, 0, -8.25, 0, 1, -12, 0, 0, 1], x: -8.25 },
])('retains a group with $name', async ({ inverse, x }) => {
  const g = graphics();
  const renderer = await owner();
  const inner = group([layer()]);
  const outer = group([
    {
      ...fullGroup(inner),
      rect: { x, y: -12, width: 64, height: 36 },
      inverse,
    },
  ]);
  await renderer.render(request([layer(), fullGroup(outer)]));
  expect(g.commands.filter((command) => command === 'begin')).toHaveLength(3);
});

it('retains cancelling source offsets when logical and physical pixel grids differ', async () => {
  const g = graphics();
  const renderer = await owner();
  const inner = { ...group([layer()]), logical: { width: 32, height: 18 } };
  const copy: GpuPreviewLayer = {
    ...layer(inner),
    rect: { x: -8, y: -12, width: 32, height: 18 },
    inverse: [1, 0, -8, 0, 1, -12, 0, 0, 1],
  };
  const outer = { ...group([copy]), logical: inner.logical };
  await renderer.render(request([layer(), fullGroup(outer)]));
  expect(g.commands.filter((command) => command === 'begin')).toHaveLength(3);
});

it('aliases a pixel-copy wrapper without expanding its shared source group', async () => {
  const g = graphics();
  const renderer = await owner();
  const shared = group([layer()]);
  const copy: GpuPreviewLayer = {
    ...fullGroup(shared),
    rect: { x: -8, y: -12, width: 64, height: 36 },
    inverse: [1, 0, -8, 0, 1, -12, 0, 0, 1],
  };
  const wrapper = group([copy]);
  await renderer.render(request([layer(), fullGroup(wrapper), fullGroup(shared)]));
  expect(g.commands.filter((command) => command === 'begin')).toHaveLength(2);
  expect(g.pass.draw).toHaveBeenCalledTimes(4);
  expect(wrapper.layers[0]).toBe(copy);
  expect(copy.source).toBe(shared);
});

it('retains a group after an existing backdrop', async () => {
  const g = graphics();
  const renderer = await owner();
  await renderer.render(request([layer(), fullGroup(group([layer()]))]));
  expect(g.commands.filter((command) => command === 'begin')).toHaveLength(2);
  expect(writtenRectWidths(g)).toEqual([32, 32, 64]);
});

it('retains both references to a shared group instead of expanding its leading reference', async () => {
  const g = graphics();
  const renderer = await owner();
  const shared = group([layer()]);
  await renderer.render(request([fullGroup(shared), fullGroup(shared)]));
  expect(g.commands.filter((command) => command === 'begin')).toHaveLength(2);
  expect(writtenRectWidths(g)).toEqual([32, 64, 64]);
});

it('keeps isolation when leading expansion would exceed the parent layer limit', async () => {
  const g = graphics();
  const renderer = await owner();
  const leading = group(Array.from({ length: 64 }, () => layer()));
  await renderer.render(request([fullGroup(leading), layer()]));
  expect(g.commands.filter((command) => command === 'begin')).toHaveLength(2);
  expect(g.pass.draw).toHaveBeenCalledTimes(66);
});

const isolatedLeadingLayers: { name: string; patch: () => Partial<GpuPreviewLayer> }[] = [
  { name: 'opacity', patch: () => ({ opacity: 0.5 }) },
  { name: 'blend', patch: () => ({ blend: 'mask' }) },
  { name: 'rect', patch: () => ({ rect: { x: 0.25, y: 0, width: 64, height: 36 } }) },
  { name: 'inverse', patch: () => ({ inverse: [1, 0, 0.25, 0, 1, 0, 0, 0, 1] }) },
  {
    name: 'clip',
    patch: () => ({ clip: { rect: { x: 0, y: 0, width: 64, height: 36 }, radius: 0 } }),
  },
  { name: 'blur', patch: () => ({ blur: 0 }) },
  { name: 'orientation', patch: () => ({ orientation: { rotation: 0, flip: false } }) },
  { name: 'source edge coverage', patch: () => ({ clampSourceEdges: ['bottom'] }) },
  {
    name: 'alpha mask',
    patch: () => ({ alphaMask: { source: raster(), rect: { x: 0, y: 0, width: 32, height: 18 } } }),
  },
  { name: 'operation clip', patch: () => ({ operationClip: { source: raster() } }) },
  { name: 'tint', patch: () => ({ tint: [1, 1, 1, 1] }) },
  { name: 'CSS filter', patch: () => ({ cssFilter: { brightness: 1 } }) },
  {
    name: 'lens',
    patch: () => ({
      lens: {
        bounds: { x: 0, y: 0, width: 64, height: 36 },
        scale: 1,
        optics: 'flat',
        edgeWidth: 0,
        corner: 0,
      },
    }),
  },
  {
    name: 'depth',
    patch: () => ({
      depth: {
        window: { x: 0, y: 0, width: 64, height: 36 },
        frame: {
          rotation: [0, 0, 0, 1],
          perspective: 0,
          windowMotion: 0,
          lockBackground: false,
          focus: [],
        },
      },
    }),
  },
];
it.each(isolatedLeadingLayers)(
  'retains an isolated leading wrapper with $name',
  async ({ patch }) => {
    const g = graphics();
    const renderer = await owner();
    await renderer.render(request([{ ...fullGroup(group([layer()])), ...patch() }]));
    expect(g.commands.filter((command) => command === 'begin').length).toBeGreaterThanOrEqual(2);
  }
);

it.each(['output', 'logical'] as const)(
  'retains a leading group with different %s density',
  async (key) => {
    const g = graphics();
    const renderer = await owner();
    const leading = group([layer()]);
    leading[key] = { width: 32, height: 18 };
    await renderer.render(request([fullGroup(leading)]));
    expect(g.commands.filter((command) => command === 'begin')).toHaveLength(2);
  }
);

it('validates the original deeply nested graph before omitting any leading copies', async () => {
  const g = graphics();
  const renderer = await owner();
  let leading = group([layer()]);
  for (let index = 0; index < 17; index++) leading = group([fullGroup(leading)]);
  await expect(renderer.render(request([fullGroup(leading)]))).rejects.toThrow('layer budget');
  expect(g.device.createTexture).not.toHaveBeenCalled();
  expect(g.queue.submit).not.toHaveBeenCalled();
  expect(g.device.pushErrorScope).not.toHaveBeenCalled();
});

it('keeps the existing two completion barriers for an aborted leading native frame', async () => {
  const g = graphics();
  const native = nativeFrames();
  const renderer = await owner();
  const source = new VideoFrame(raster());
  native.frames[0]!.codedHeight = 18;
  const controller = new AbortController();
  const fence = deferred<void>(),
    validation = deferred<{ message: string } | null>();
  g.queue.onSubmittedWorkDone.mockReturnValue(fence.promise);
  g.device.popErrorScope.mockReturnValue(validation.promise);
  const pending = renderer.render(request([fullGroup(group([layer(source)]))], controller.signal));
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(g.queue.submit).toHaveBeenCalledOnce());
  expect(g.commands.filter((command) => command === 'begin')).toHaveLength(1);
  expect(g.device.createTexture).not.toHaveBeenCalled();
  controller.abort();
  fence.resolve(undefined);
  await Promise.resolve();
  expect(g.transfer).not.toHaveBeenCalled();
  expect(native.frames[0]!.close).not.toHaveBeenCalled();
  validation.resolve(null);
  await rejected;
  expect(g.transfer).not.toHaveBeenCalled();
  expect(native.frames[0]!.close).not.toHaveBeenCalled();
});

it('overlaps two complete requests only after the first validation scope is popped', async () => {
  const g = graphics();
  const fences = [deferred<void>(), deferred<void>()];
  const scopes = [deferred<null>(), deferred<null>()];
  g.queue.onSubmittedWorkDone
    .mockReturnValueOnce(fences[0]!.promise)
    .mockReturnValueOnce(fences[1]!.promise);
  g.device.popErrorScope
    .mockReturnValueOnce(scopes[0]!.promise)
    .mockReturnValueOnce(scopes[1]!.promise);
  const renderer = await owner({ maximumInFlight: 2 });
  const first = renderer.render(request());
  const second = renderer.render(request());
  // Attach handlers before the unsupported baseline rejects the second request.
  const settled = Promise.allSettled([first, second]);
  await vi.waitFor(() => expect(g.queue.submit).toHaveBeenCalledTimes(2));
  expect(g.adapter.requestDevice).toHaveBeenCalledOnce();
  expect(g.device.pushErrorScope).toHaveBeenCalledTimes(2);
  expect(g.device.popErrorScope).toHaveBeenCalledTimes(2);
  expect(g.device.pushErrorScope.mock.invocationCallOrder[1]).toBeGreaterThan(
    g.device.popErrorScope.mock.invocationCallOrder[0]!
  );
  await expect(renderer.render(request())).rejects.toThrow('frame in flight');
  scopes[1]!.resolve(null);
  fences[1]!.resolve();
  const secondBitmap = await second;
  expect(g.transfer).toHaveBeenCalledOnce();
  scopes[0]!.resolve(null);
  fences[0]!.resolve();
  expect(await first).not.toBe(secondBitmap);
  await settled;
});

it('keeps two private outputs, uniforms and textures until each complete request settles', async () => {
  const g = graphics();
  const fences = [deferred<void>(), deferred<void>()];
  const scopes = [deferred<null>(), deferred<null>()];
  fences.forEach((fence) => g.queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise));
  scopes.forEach((scope) => g.device.popErrorScope.mockReturnValueOnce(scope.promise));
  const renderer = await owner({ maximumInFlight: 2, reserve: g.reserve });
  const first = renderer.render(request());
  const secondRequest = { ...request(), output: { width: 128, height: 72 } };
  const second = renderer.render(secondRequest);
  await vi.waitFor(() => expect(g.queue.submit).toHaveBeenCalledTimes(2));
  expect(g.contexts).toHaveLength(2);
  expect(g.queue.writeBuffer.mock.calls[0]![0]).not.toBe(g.queue.writeBuffer.mock.calls[1]![0]);
  expect(g.device.createTexture).toHaveBeenCalledTimes(2);
  const expectedBytes = 64 * 36 * 8 + 128 * 72 * 8 + 2 * (32 * 18 * 4 + GPU_PREVIEW_UNIFORM_BYTES);
  expect(renderer.allocatedBytes).toBe(expectedBytes);
  expect(g.reserve.mock.calls.reduce((sum, call) => sum + call[0], 0)).toBe(expectedBytes);
  fences[1]!.resolve();
  scopes[1]!.resolve(null);
  expect(await second).toMatchObject({ width: 128, height: 72 });
  // Reuse the completed slot while the oldest request still owns its surface and uniforms.
  expect(await renderer.render(secondRequest)).toBe(g.bitmaps[1]);
  expect(g.contexts).toHaveLength(2);
  expect(g.transfer).toHaveBeenCalledTimes(2);
  fences[0]!.resolve();
  scopes[0]!.resolve(null);
  expect(await first).toBe(g.bitmap);
  expect(g.bitmap).toMatchObject({ width: 64, height: 36 });
  renderer.dispose();
  renderer.dispose();
  expect(renderer.allocatedBytes).toBe(0);
  expect(g.device.destroy).toHaveBeenCalledOnce();
  for (const result of g.reserve.mock.results) expect(result.value.release).toHaveBeenCalledOnce();
  for (const result of g.device.createTexture.mock.results)
    expect(result.value.destroy).toHaveBeenCalledOnce();
  for (const result of g.device.createBuffer.mock.results)
    expect(result.value.destroy).toHaveBeenCalledOnce();
  for (const context of g.contexts) expect(context.unconfigure).toHaveBeenCalledTimes(2);
});

it.each(['queue', 'validation', 'sync-pop'] as const)(
  'keeps the failing slot borrowed until its other barrier settles without rejecting its peer: %s',
  async (mode) => {
    const g = graphics();
    const fence = deferred<void>();
    const scope = deferred<null>();
    g.queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
    if (mode === 'sync-pop')
      g.device.popErrorScope.mockImplementationOnce(() => {
        throw new Error('validation failed');
      });
    else g.device.popErrorScope.mockReturnValueOnce(scope.promise);
    const renderer = await owner({ maximumInFlight: 2 });
    const source = new VideoFrame(raster());
    const first = renderer.render(request([layer(source)]));
    const outcome = first.then(
      () => 'fulfilled',
      () => 'rejected'
    );
    let settled = false;
    void outcome.then(() => {
      settled = true;
    });
    if (mode === 'queue') fence.reject(new Error('queue failed'));
    else if (mode === 'validation') scope.reject(new Error('validation failed'));
    expect(await renderer.render(request())).toBe(g.bitmaps[1]);
    expect(settled).toBe(false);
    expect(source.close).not.toHaveBeenCalled();
    if (mode === 'queue') scope.resolve(null);
    else fence.resolve();
    expect(await outcome).toBe('rejected');
    expect(g.transfer).toHaveBeenCalledOnce();
    expect(source.close).not.toHaveBeenCalled();
    expect(await renderer.render(request())).toBe(g.bitmap);
  }
);

it.each(['abort', 'loss', 'dispose'] as const)(
  'waits for both private slots before cleanup and never publishes after %s',
  async (action) => {
    const g = graphics();
    const fences = [deferred<void>(), deferred<void>()];
    const scopes = [deferred<null>(), deferred<null>()];
    fences.forEach((fence) => g.queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise));
    scopes.forEach((scope) => g.device.popErrorScope.mockReturnValueOnce(scope.promise));
    const renderer = await owner({ maximumInFlight: 2, reserve: g.reserve });
    const controller = new AbortController();
    const sources = [new VideoFrame(raster()), new VideoFrame(raster())];
    const pending = sources.map((source) =>
      renderer.render(request([layer(source)], controller.signal))
    );
    const outcomes = Promise.allSettled(pending);
    await vi.waitFor(() => expect(g.queue.submit).toHaveBeenCalledTimes(2));
    if (action === 'abort') controller.abort();
    else if (action === 'loss') g.lost.resolve({ message: 'lost both slots' });
    else renderer.dispose();
    scopes[0]!.resolve(null);
    fences[1]!.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(g.transfer).not.toHaveBeenCalled();
    expect(g.device.destroy).not.toHaveBeenCalled();
    expect(renderer.allocatedBytes).toBeGreaterThan(0);
    scopes[1]!.resolve(null);
    await pending[1]!.catch(() => {});
    expect(g.device.destroy).not.toHaveBeenCalled();
    fences[0]!.resolve();
    const result = await outcomes;
    expect(result.map((entry) => entry.status)).toEqual(['rejected', 'rejected']);
    if (action === 'loss')
      for (const entry of result)
        if (entry.status === 'rejected') expect(entry.reason).toBeInstanceOf(GpuPreviewDeviceError);
    expect(g.transfer).not.toHaveBeenCalled();
    renderer.dispose();
    expect(renderer.allocatedBytes).toBe(0);
    expect(g.device.destroy).toHaveBeenCalledOnce();
    for (const source of sources) expect(source.close).not.toHaveBeenCalled();
    for (const result of g.reserve.mock.results)
      expect(result.value.release).toHaveBeenCalledOnce();
  }
);

it('retains the device scope stack during asynchronous pipeline preparation and cancels a waiting slot', async () => {
  const g = graphics();
  const native = nativeFrames();
  const renderer = await owner({ maximumInFlight: 2 });
  const readyPipeline = g.device.createRenderPipelineAsync.mock.results[0]!.value;
  const pipeline = deferred<Awaited<typeof readyPipeline>>();
  g.device.createRenderPipelineAsync.mockReturnValueOnce(pipeline.promise);
  const source = new VideoFrame(raster());
  const first = renderer.render(
    request([
      {
        ...layer(source),
        lens: {
          bounds: { x: 0, y: 0, width: 32, height: 18 },
          scale: 2,
          optics: 'flat',
          edgeWidth: 0,
          corner: 'circle',
        },
      },
    ])
  );
  const controller = new AbortController();
  const second = renderer.render(request([], controller.signal));
  const secondOutcome = second.catch((error: unknown) => error);
  await Promise.resolve();
  expect(g.device.pushErrorScope).toHaveBeenCalledOnce();
  expect(g.device.popErrorScope).not.toHaveBeenCalled();
  expect(g.contexts).toHaveLength(1);
  controller.abort();
  pipeline.resolve(await readyPipeline);
  await first;
  expect(await secondOutcome).toMatchObject({ name: 'AbortError' });
  expect(g.device.pushErrorScope).toHaveBeenCalledOnce();
  expect(g.contexts).toHaveLength(1);
  expect(native.copy.mock.calls.length).toBe(0);
});

it('recovers slot capacity after lazy slot initialization fails without destroying the active device', async () => {
  const g = graphics();
  const fence = deferred<void>();
  g.queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
  const renderer = await owner({ maximumInFlight: 2 });
  const first = renderer.render(request());
  g.device.createRenderPipelineAsync.mockRejectedValueOnce(
    new Error('second slot pipeline failed')
  );
  await expect(renderer.render(request())).rejects.toThrow('second slot pipeline failed');
  expect(g.device.destroy).not.toHaveBeenCalled();
  expect(g.contexts[1]!.unconfigure).toHaveBeenCalledOnce();
  await expect(renderer.render(request())).resolves.toBe(g.bitmaps[2]);
  fence.resolve();
  await first;
  renderer.dispose();
  expect(g.device.destroy).toHaveBeenCalledOnce();
});

it('keeps the encoding lock until failure cleanup actually invokes popErrorScope', async () => {
  const g = graphics();
  const fence = deferred<void>();
  const scope = deferred<null>();
  g.queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
  g.device.popErrorScope.mockReturnValueOnce(scope.promise);
  g.queue.copyExternalImageToTexture.mockImplementationOnce(() => {
    throw new Error('upload failed');
  });
  const renderer = await owner({ maximumInFlight: 2 });
  const first = renderer.render(request()).catch((error: unknown) => error);
  const second = renderer.render(request());
  await Promise.resolve();
  await Promise.resolve();
  expect(g.device.pushErrorScope).toHaveBeenCalledOnce();
  expect(g.device.popErrorScope).not.toHaveBeenCalled();
  expect(g.contexts).toHaveLength(1);
  fence.resolve();
  expect(await second).toBe(g.bitmaps[1]);
  expect(g.device.pushErrorScope.mock.invocationCallOrder[1]).toBeGreaterThan(
    g.device.popErrorScope.mock.invocationCallOrder[0]!
  );
  scope.resolve(null);
  expect(await first).toMatchObject({ message: 'upload failed' });
});

it('reuses and evicts native RGB targets only after their own two barriers settle', async () => {
  const g = graphics();
  const native = nativeFrames();
  const fences = [deferred<void>(), deferred<void>()];
  const scopes = [deferred<null>(), deferred<null>()];
  fences.forEach((fence) => g.queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise));
  scopes.forEach((scope) => g.device.popErrorScope.mockReturnValueOnce(scope.promise));
  const renderer = await owner({ maximumInFlight: 2, reserve: g.reserve });
  const sources = [new VideoFrame(raster()), new VideoFrame(raster())];
  const first = renderer.render(request([layer(sources[0]!)]));
  const second = renderer.render(request([layer(sources[1]!)]));
  await vi.waitFor(() => expect(g.queue.submit).toHaveBeenCalledTimes(2));
  const targets = g.device.createTexture.mock.results
    .filter(
      (result) =>
        result.type === 'return' && result.value.width === 32 && result.value.height === 18
    )
    .map((result) => result.value);
  expect(targets).toHaveLength(2);
  expect(targets[0]).not.toBe(targets[1]);
  expect(
    g.device.importExternalTexture.mock.calls.map(([descriptor]) => descriptor.source)
  ).toEqual(sources);
  expect(native.copy.mock.calls.length).toBe(0);
  const initialBytes = renderer.allocatedBytes;
  scopes[1]!.resolve(null);
  fences[1]!.resolve();
  await second;
  expect(targets[1]!.destroy).not.toHaveBeenCalled();
  await renderer.render(request([]));
  expect(targets[1]!.destroy).toHaveBeenCalledOnce();
  expect(targets[0]!.destroy).not.toHaveBeenCalled();
  expect(renderer.allocatedBytes).toBe(initialBytes - 32 * 18 * 4);
  fences[0]!.resolve();
  await Promise.resolve();
  expect(targets[0]!.destroy).not.toHaveBeenCalled();
  scopes[0]!.resolve(null);
  await first;
  await renderer.render(request([]));
  expect(targets[0]!.destroy).toHaveBeenCalledOnce();
  for (const source of sources) expect(source.close).not.toHaveBeenCalled();
  renderer.dispose();
  expect(renderer.allocatedBytes).toBe(0);
});

function presentationCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 36;
  const view = { destination: true };
  const context = {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({ createView: () => view })),
  };
  const getContext = vi.fn(() => context);
  Object.defineProperty(canvas, 'getContext', { value: getContext });
  return { canvas, context, getContext, view };
}

it.each([0, -1, 1.5, 9, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])(
  'rejects invalid presentation surface limit %s before device allocation',
  async (maximumPresentationSurfaces) => {
    const g = graphics();
    await expect(createGpuPreviewRenderer({ maximumPresentationSurfaces })).rejects.toThrow(
      'presentation surface limit is invalid'
    );
    expect(navigator.gpu.requestAdapter).not.toHaveBeenCalled();
    expect(g.adapter.requestDevice).not.toHaveBeenCalled();
  }
);

it.each([1, 2, 3, 4, 5, 6, 7, 8])(
  'admits exactly %s explicit presentation surfaces and recovers released capacity',
  async (maximumPresentationSurfaces) => {
    graphics();
    const renderer = await owner({ maximumPresentationSurfaces });
    const surfaces = Array.from({ length: maximumPresentationSurfaces }, () =>
      renderer.createSurface!(presentationCanvas().canvas)
    );
    expect(() => renderer.createSurface!(presentationCanvas().canvas)).toThrow('surface capacity');
    surfaces[0]!.dispose();
    expect(() => renderer.createSurface!(presentationCanvas().canvas)).not.toThrow();
  }
);

it.each([0, -1, 1.5, 512 * 1024 * 1024 + 1, Number.NaN, Number.POSITIVE_INFINITY])(
  'rejects invalid presentation byte limit %s before device allocation',
  async (maximumPresentationBytes) => {
    const g = graphics();
    await expect(createGpuPreviewRenderer({ maximumPresentationBytes })).rejects.toThrow(
      'presentation byte limit is invalid'
    );
    expect(navigator.gpu.requestAdapter).not.toHaveBeenCalled();
    expect(g.adapter.requestDevice).not.toHaveBeenCalled();
  }
);

it.each([1, 512 * 1024 * 1024])(
  'accepts the presentation byte limit boundary %s',
  async (maximumPresentationBytes) => {
    graphics();
    await expect(owner({ maximumPresentationBytes })).resolves.toBeDefined();
  }
);

it.each([1, 2] as const)(
  'preserves the default presentation surface limit for %s GPU jobs',
  async (maximumInFlight) => {
    graphics();
    const renderer = await owner({ maximumInFlight });
    for (let index = 0; index < maximumInFlight + 1; index++)
      renderer.createSurface!(presentationCanvas().canvas);
    expect(() => renderer.createSurface!(presentationCanvas().canvas)).toThrow('surface capacity');
  }
);

it('retains five presentation surfaces without admitting a second GPU job', async () => {
  const g = graphics();
  const renderer = await owner({ maximumInFlight: 1, maximumPresentationSurfaces: 5 });
  const outputs = Array.from({ length: 5 }, () => presentationCanvas());
  const surfaces = outputs.map((output) => renderer.createSurface!(output.canvas));
  expect(() => renderer.createSurface!(presentationCanvas().canvas)).toThrow('surface capacity');
  for (const surface of surfaces) await surface.present(request());
  expect(outputs.every((output) => output.context.getCurrentTexture.mock.calls.length === 1)).toBe(
    true
  );
  const fence = deferred<void>();
  g.queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
  const pending = surfaces[0]!.present(request());
  try {
    await vi.waitFor(() => expect(g.queue.submit).toHaveBeenCalledTimes(6));
    await expect(surfaces[1]!.present(request())).rejects.toThrow('frame in flight');
    await expect(renderer.render(request())).rejects.toThrow('frame in flight');
    expect(g.queue.submit).toHaveBeenCalledTimes(6);
  } finally {
    fence.resolve();
    await pending;
  }
  await surfaces[1]!.present(request());
  expect(g.queue.submit).toHaveBeenCalledTimes(7);
});

it.each([
  { allowance: undefined, admitted: 4 },
  { allowance: 3840 * 2160 * 8 * 5, admitted: 5 },
  { allowance: 3840 * 2160 * 8 * 5 - 1, admitted: 4 },
])(
  'bounds retained 4K presentation storage with allowance $allowance',
  async ({ allowance, admitted }) => {
    const g = graphics();
    const renderer = await owner({
      maximumPresentationSurfaces: 5,
      reserve: g.reserve,
      ...(allowance !== undefined ? { maximumPresentationBytes: allowance } : {}),
    });
    const baselineBytes = renderer.allocatedBytes;
    const outputs = Array.from({ length: 5 }, () => {
      const output = presentationCanvas();
      output.canvas.width = 3840;
      output.canvas.height = 2160;
      return output;
    });
    const surfaces = outputs.map((output) => renderer.createSurface!(output.canvas));
    const frame = {
      ...request([]),
      output: { width: 3840, height: 2160 },
      logical: { width: 3840, height: 2160 },
    };
    for (const surface of surfaces.slice(0, admitted)) await surface.present(frame);
    expect(renderer.allocatedBytes - baselineBytes).toBe(3840 * 2160 * 8 * admitted);
    expect(g.queue.submit).toHaveBeenCalledTimes(admitted);
    if (admitted < surfaces.length) {
      const reservations = g.reserve.mock.calls.length;
      await expect(surfaces[admitted]!.present(frame)).rejects.toThrow('storage budget');
      expect(outputs[admitted]!.context.configure).not.toHaveBeenCalled();
      expect(g.reserve).toHaveBeenCalledTimes(reservations);
      expect(g.queue.submit).toHaveBeenCalledTimes(admitted);
      expect(renderer.allocatedBytes - baselineBytes).toBe(3840 * 2160 * 8 * admitted);
    }
  }
);

it('presents directly to a leased GPU canvas without creating a bitmap and retains both barriers', async () => {
  const g = graphics();
  const destination = presentationCanvas();
  const renderer = await owner({ reserve: g.reserve });
  expect(renderer.createSurface).toBeTypeOf('function');
  if (!renderer.createSurface) throw new Error('Expected direct presentation capability.');
  const surface = renderer.createSurface(destination.canvas);
  const fence = deferred<void>();
  const scope = deferred<null>();
  g.queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
  g.device.popErrorScope.mockReturnValueOnce(scope.promise);
  const complete = vi.fn();
  const pending = surface.present(request()).then(complete, (error: unknown) => error);
  await vi.waitFor(() => expect(g.queue.submit).toHaveBeenCalledOnce());
  expect(destination.getContext).toHaveBeenCalledWith('webgpu');
  expect(g.context.configure).not.toHaveBeenCalled();
  expect(g.transfer).not.toHaveBeenCalled();
  expect(
    g.device.createCommandEncoder.mock.results[0]!.value.beginRenderPass.mock.calls[0]![0]
  ).toMatchObject({ colorAttachments: [{ view: destination.view }] });
  renderer.dispose();
  expect(destination.context.unconfigure).not.toHaveBeenCalled();
  expect(g.device.destroy).not.toHaveBeenCalled();
  fence.resolve();
  await Promise.resolve();
  expect(complete).not.toHaveBeenCalled();
  scope.resolve(null);
  expect(await pending).toBeInstanceOf(Error);
  expect(complete).not.toHaveBeenCalled();
  expect(destination.context.unconfigure).toHaveBeenCalledOnce();
  expect(g.device.destroy).toHaveBeenCalledOnce();
  expect(renderer.allocatedBytes).toBe(0);
});

it('keeps direct destinations isolated and preserves ordinary bitmap output on the same backend', async () => {
  const g = graphics();
  const renderer = await owner({ maximumInFlight: 2 });
  if (!renderer.createSurface) throw new Error('Expected direct presentation capability.');
  const outputs = [presentationCanvas(), presentationCanvas()];
  const surfaces = outputs.map((output) => renderer.createSurface!(output.canvas));
  const fence = deferred<void>();
  g.queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
  const first = surfaces[0]!.present(request());
  await vi.waitFor(() => expect(g.queue.submit).toHaveBeenCalledOnce());
  await surfaces[1]!.present(request());
  expect(g.transfer).not.toHaveBeenCalled();
  expect(outputs.every((output) => output.context.getCurrentTexture.mock.calls.length === 1)).toBe(
    true
  );
  expect(await renderer.render(request())).toBe(g.bitmaps[1]);
  expect(g.transfer).toHaveBeenCalledOnce();
  fence.resolve();
  await first;
  renderer.dispose();
  expect(renderer.allocatedBytes).toBe(0);
});

it('does not classify retirement of one direct destination as device failure', async () => {
  const g = graphics();
  const renderer = await owner();
  if (!renderer.createSurface) throw new Error('Expected direct presentation capability.');
  const surface = renderer.createSurface(presentationCanvas().canvas);
  surface.dispose();
  const failure = await surface.present(request()).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(failure).not.toBeInstanceOf(GpuPreviewDeviceError);
  expect(await renderer.render(request())).toBe(g.bitmap);
});

it.each(['scope-first', 'fence-first'] as const)(
  'hands the completed GPU image to the frontend only after both barriers: %s',
  async (order) => {
    const g = graphics(),
      fence = deferred<void>(),
      scope = deferred<{ message: string } | null>();
    g.queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
    g.device.popErrorScope.mockReturnValueOnce(scope.promise);
    const renderer = await owner();
    const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 36 });
    const accept = vi.fn();
    Object.defineProperty(canvas, 'getContext', {
      value: vi.fn(() => ({ transferFromImageBitmap: accept })),
    });
    const surface = renderer.createSurface!(canvas, { offscreen: true });
    const pending = surface.present(request());
    await vi.waitFor(() => expect(g.device.popErrorScope).toHaveBeenCalledOnce());
    if (order === 'scope-first') scope.resolve(null);
    else fence.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(accept).not.toHaveBeenCalled();
    expect(g.transfer).not.toHaveBeenCalled();
    if (order === 'scope-first') fence.resolve();
    else scope.resolve(null);
    await pending;
    expect(g.transfer).toHaveBeenCalledOnce();
    const bitmap = g.bitmaps[1]!;
    expect(accept).toHaveBeenCalledExactlyOnceWith(bitmap);
    expect(bitmap.close).toHaveBeenCalledOnce();
    renderer.dispose();
    expect(g.device.destroy).not.toHaveBeenCalled();
    expect(renderer.allocatedBytes).toBeGreaterThan(0);
    surface.releaseImage?.();
    expect(accept.mock.calls.at(-1)).toEqual([null]);
    expect(g.device.destroy).toHaveBeenCalledOnce();
    expect(renderer.allocatedBytes).toBe(0);
    surface.dispose();
  }
);

it('finishes device retirement when frontend disposes its last transferred image surface', async () => {
  const g = graphics(),
    renderer = await owner();
  const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 36 });
  const accept = vi.fn();
  Object.defineProperty(canvas, 'getContext', {
    value: vi.fn(() => ({ transferFromImageBitmap: accept })),
  });
  const surface = renderer.createSurface!(canvas, { offscreen: true });
  await surface.present(request());
  renderer.dispose();
  expect(g.device.destroy).not.toHaveBeenCalled();
  surface.dispose();
  expect(g.device.destroy).toHaveBeenCalledOnce();
  expect(renderer.allocatedBytes).toBe(0);
});

it('omits overwritten backdrop and decoration behind a full opaque video plane', async () => {
  const g = graphics();
  const native = nativeFrames();
  const renderer = await owner();
  const video = new VideoFrame(raster());
  native.frames[0]!.codedHeight = 18;
  const backdrop = raster(),
    decoration = raster();
  const plane: GpuPreviewLayer = {
    ...layer(video),
    rect: { x: 0, y: 0, width: 64, height: 36 },
    clip: { rect: { x: 0, y: 0, width: 64, height: 36 }, radius: 0 },
  };
  const window = group([layer(decoration), plane]);
  const input = request([layer(backdrop), fullGroup(window)]);
  await renderer.render(input);
  expect(g.commands.filter((command) => command === 'begin')).toHaveLength(1);
  expect(g.pass.draw).toHaveBeenCalledOnce();
  expect(g.queue.copyExternalImageToTexture).not.toHaveBeenCalled();
  expect(g.device.importExternalTexture).toHaveBeenCalledOnce();
  expect(input.layers).toHaveLength(2);
  expect(window.layers).toEqual([layer(decoration), plane]);
  expect(video.close).not.toHaveBeenCalled();
});

it.each<VideoPixelFormat | null>(['RGBA', 'BGRA', 'I420A', null])(
  'retains the backdrop for video with unproven opaque format %s',
  async (format) => {
    const g = graphics();
    const native = nativeFrames();
    const renderer = await owner();
    const video = new VideoFrame(raster());
    Object.defineProperty(native.frames[0]!, 'format', { value: format });
    const backdrop = raster();
    await renderer.render(
      request([
        layer(backdrop),
        fullGroup(group([{ ...layer(video), rect: fullGroup(group([])).rect }])),
      ])
    );
    expect(
      g.queue.copyExternalImageToTexture.mock.calls.some(([entry]) => entry.source === backdrop)
    ).toBe(true);
    expect(g.commands.filter((command) => command === 'begin')).toHaveLength(2);
  }
);

it('validates malformed hidden input before eliminating opaque occlusion', async () => {
  const g = graphics();
  const native = nativeFrames();
  const renderer = await owner();
  const video = new VideoFrame(raster());
  native.frames[0]!.codedHeight = 18;
  const invalid = { ...layer(), rect: { x: 0, y: 0, width: 0, height: 18 } };
  await expect(
    renderer.render(request([invalid, { ...layer(video), rect: fullGroup(group([])).rect }]))
  ).rejects.toThrow();
  expect(g.queue.submit).not.toHaveBeenCalled();
});

it.each(isolatedLeadingLayers)(
  'keeps a nonleading opaque group isolated when its wrapper has $name',
  async ({ patch }) => {
    const g = graphics();
    const native = nativeFrames();
    const renderer = await owner();
    const video = new VideoFrame(raster());
    native.frames[0]!.codedHeight = 18;
    const backdrop = raster();
    const opaque = group([{ ...layer(video), rect: { x: 0, y: 0, width: 64, height: 36 } }]);
    await renderer.render(request([layer(backdrop), { ...fullGroup(opaque), ...patch() }]));
    expect(
      g.queue.copyExternalImageToTexture.mock.calls.some(([entry]) => entry.source === backdrop)
    ).toBe(true);
  }
);

const uncertainOpaqueCoverage: { name: string; patch: Partial<GpuPreviewLayer> }[] = [
  { name: 'partial plane', patch: { rect: { x: 1, y: 0, width: 63, height: 36 } } },
  { name: 'translation', patch: { inverse: [1, 0, 1, 0, 1, 0, 0, 0, 1] } },
  { name: 'opacity', patch: { opacity: 0.5 } },
  { name: 'additive blend', patch: { blend: 'add' } },
  { name: 'orientation', patch: { orientation: { rotation: 90, flip: false } } },
  {
    name: 'rounded clip',
    patch: { clip: { rect: { x: 0, y: 0, width: 64, height: 36 }, radius: 4 } },
  },
  {
    name: 'ellipse',
    patch: { clip: { rect: { x: 0, y: 0, width: 64, height: 36 }, radius: 0, shape: 'ellipse' } },
  },
];
it.each(uncertainOpaqueCoverage)(
  'retains the backdrop with $name on native video',
  async ({ patch }) => {
    const g = graphics();
    const native = nativeFrames();
    const renderer = await owner();
    const video = new VideoFrame(raster());
    native.frames[0]!.codedHeight = 18;
    const backdrop = raster();
    const plane = { ...layer(video), rect: { x: 0, y: 0, width: 64, height: 36 }, ...patch };
    await renderer.render(request([layer(backdrop), fullGroup(group([plane]))]));
    expect(
      g.queue.copyExternalImageToTexture.mock.calls.some(([entry]) => entry.source === backdrop)
    ).toBe(true);
  }
);

it('retains the backdrop when a mask follows the opaque plane', async () => {
  const g = graphics();
  const native = nativeFrames();
  const renderer = await owner();
  const video = new VideoFrame(raster());
  native.frames[0]!.codedHeight = 18;
  const backdrop = raster();
  const plane = { ...layer(video), rect: { x: 0, y: 0, width: 64, height: 36 } };
  await renderer.render(
    request([layer(backdrop), fullGroup(group([plane, { ...layer(), blend: 'mask' }]))])
  );
  expect(
    g.queue.copyExternalImageToTexture.mock.calls.some(([entry]) => entry.source === backdrop)
  ).toBe(true);
});

function mainPipelineCalls(g: ReturnType<typeof graphics>) {
  return g.device.createRenderPipelineAsync.mock.calls.filter(([descriptor]) =>
    Array.from(descriptor.fragment?.targets ?? []).some((target) => !!target?.blend)
  );
}

it('creates only the used ordinary variant and reuses it across both pending slots', async () => {
  const g = graphics();
  const renderer = await owner({ maximumInFlight: 2 });
  expect(mainPipelineCalls(g)).toHaveLength(0);
  const fence = deferred<void>();
  g.queue.onSubmittedWorkDone.mockReturnValueOnce(fence.promise);
  const submitted = deferred<void>();
  const first = renderer.render({ ...request(), onSubmitted: () => submitted.resolve() });
  await submitted.promise;
  await renderer.render(request());
  expect(mainPipelineCalls(g)).toHaveLength(1);
  fence.resolve();
  await first;
  await renderer.render(request());
  expect(mainPipelineCalls(g)).toHaveLength(1);
});

it('does not compile an unused failing blend and reports it only when requested', async () => {
  const g = graphics();
  const original = g.device.createRenderPipelineAsync.getMockImplementation()!;
  const failure = new Error('unused atop variant');
  g.device.createRenderPipelineAsync.mockImplementation((descriptor) => {
    const targets = Array.from(descriptor.fragment?.targets ?? []);
    return targets.some((target) => target?.blend?.color.srcFactor === 'dst-alpha')
      ? Promise.reject(failure)
      : original(descriptor);
  });
  const renderer = await owner();
  await renderer.render(request());
  expect(mainPipelineCalls(g)).toHaveLength(1);
  await expect(renderer.render(request([{ ...layer(), blend: 'atop' }]))).rejects.toBe(failure);
  await renderer.render(request());
  expect(mainPipelineCalls(g)).toHaveLength(2);
});

it('starts all required variant compilations together before encoding', async () => {
  const g = graphics();
  const renderer = await owner();
  const original = g.device.createRenderPipelineAsync.getMockImplementation()!;
  const gates = [deferred<void>(), deferred<void>()];
  const started = deferred<void>();
  let calls = 0;
  g.device.createRenderPipelineAsync.mockImplementation(async (descriptor) => {
    const index = calls++;
    if (calls === 2) started.resolve();
    await gates[index]!.promise;
    return original(descriptor);
  });
  const pending = renderer.render(
    request([
      layer(),
      { ...layer(), alphaMask: { source: raster(), rect: { x: 0, y: 0, width: 32, height: 18 } } },
    ])
  );
  await Promise.race([started.promise, pending]);
  expect(calls).toBe(2);
  expect(g.queue.submit).not.toHaveBeenCalled();
  gates[1]!.resolve();
  gates[0]!.resolve();
  await pending;
  expect(mainPipelineCalls(g)).toHaveLength(2);
});

it.each(['over', 'add', 'mask', 'erase', 'screen', 'atop'] as const)(
  'keeps every used source and shader flag distinct for blend %s',
  async (blend) => {
    const g = graphics();
    const renderer = await owner();
    const expectedBlend: Record<typeof blend, GPUBlendState> = {
      over: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      },
      add: {
        color: { srcFactor: 'one', dstFactor: 'one' },
        alpha: { srcFactor: 'one', dstFactor: 'one' },
      },
      mask: {
        color: { srcFactor: 'zero', dstFactor: 'src-alpha' },
        alpha: { srcFactor: 'zero', dstFactor: 'src-alpha' },
      },
      erase: {
        color: { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha' },
      },
      screen: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      },
      atop: {
        color: { srcFactor: 'dst-alpha', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'dst-alpha', dstFactor: 'one-minus-src-alpha' },
      },
    };
    for (let flags = 0; flags < 32; flags++) {
      const external = !!(flags & 1),
        effects = !!(flags & 2),
        masked = !!(flags & 4),
        clip = !!(flags & 8),
        tint = !!(flags & 16);
      const input = request([
        {
          ...layer(external ? new VideoFrame(raster()) : raster()),
          blend,
          ...(effects
            ? {
                lens: {
                  bounds: { x: 0, y: 0, width: 32, height: 18 },
                  scale: 2,
                  optics: 'flat' as const,
                  edgeWidth: 0,
                  corner: 'circle' as const,
                },
              }
            : {}),
          ...(masked
            ? { alphaMask: { source: raster(), rect: { x: 0, y: 0, width: 32, height: 18 } } }
            : {}),
          ...(clip ? { operationClip: { source: raster() } } : {}),
          ...(tint ? { tint: [0.2, 0.4, 0.6, 0.5] as const } : {}),
        },
      ]);
      await renderer.render(input);
      const compiled = await Promise.all(
        g.device.createRenderPipelineAsync.mock.results.map((result) => result.value)
      );
      const selected = g.pass.setPipeline.mock.lastCall![0];
      const descriptor =
        g.device.createRenderPipelineAsync.mock.calls[compiled.indexOf(selected)]![0];
      expect(Array.from(descriptor.fragment!.targets)[0]!.blend).toEqual(expectedBlend[blend]);
      const moduleIndex = g.device.createShaderModule.mock.results.findIndex(
        (result) => result.value === descriptor.vertex.module
      );
      expect(g.device.createShaderModule.mock.calls[moduleIndex]![0].code).toBe(
        gpuPreviewShader(external, effects, masked, { clip, tint })
      );
      const count = mainPipelineCalls(g).length;
      await renderer.render(input);
      expect(mainPipelineCalls(g)).toHaveLength(count);
    }
    expect(mainPipelineCalls(g)).toHaveLength(32);
  }
);

it.each(['native', 'blur', 'depth', 'css'] as const)(
  'compiles the external conversion and RGB sampling variants required by %s',
  async (kind) => {
    const g = graphics();
    const native = nativeFrames();
    const renderer = await owner();
    const source = new VideoFrame(raster());
    if (kind !== 'native') native.frames[0]!.codedHeight = 18;
    const input = layer(source);
    if (kind === 'blur') input.blur = 2;
    if (kind === 'css') input.cssFilter = { brightness: 1.1 };
    if (kind === 'depth')
      input.depth = {
        window: { x: 0, y: 0, width: 32, height: 18 },
        frame: {
          rotation: [0, 0, 0, 1],
          perspective: 0,
          windowMotion: 0,
          lockBackground: false,
          focus: [],
        },
      };
    await renderer.render(request([input]));
    const calls = mainPipelineCalls(g);
    expect(calls).toHaveLength(2);
    const shaders = calls.map(([descriptor]) => {
      const index = g.device.createShaderModule.mock.results.findIndex(
        (result) => result.value === descriptor.vertex.module
      );
      return g.device.createShaderModule.mock.calls[index]![0].code;
    });
    expect(shaders).toContain(gpuPreviewShader(true, false, false));
    expect(shaders).toContain(gpuPreviewShader(false, kind === 'blur' || kind === 'depth', false));
    expect(native.copy).not.toHaveBeenCalled();
    expect(native.frames[0]!.close).not.toHaveBeenCalled();
  }
);

function prepareOnly(renderer: GpuPreviewRenderer, input = request()) {
  if (!renderer.preparePipelines) throw new Error('Expected nondrawing pipeline preparation.');
  return renderer.preparePipelines(input);
}

it('prepares used pipelines without uploads, rendering, output, or source borrowing after return', async () => {
  const g = graphics();
  const renderer = await owner({ reserve: g.reserve });
  const source = raster();
  const input = request([{ ...layer(source), operationClip: { source } }]);
  const pending = prepareOnly(renderer, input);
  Object.defineProperty(source, 'width', {
    get: () => {
      throw new Error('source released');
    },
  });
  await pending;
  expect(mainPipelineCalls(g)).toHaveLength(1);
  expect(g.device.createTexture).not.toHaveBeenCalled();
  expect(g.device.createBuffer).not.toHaveBeenCalled();
  expect(g.device.createCommandEncoder).not.toHaveBeenCalled();
  expect(g.queue.copyExternalImageToTexture).not.toHaveBeenCalled();
  expect(g.queue.submit).not.toHaveBeenCalled();
  expect(g.queue.onSubmittedWorkDone).not.toHaveBeenCalled();
  expect(g.context.configure).not.toHaveBeenCalled();
  expect(g.transfer).not.toHaveBeenCalled();
  expect(g.reserve).not.toHaveBeenCalled();
  await renderer.render(request([{ ...layer(), operationClip: { source: raster() } }]));
  expect(mainPipelineCalls(g)).toHaveLength(1);
});

it('allows unrelated foreground rendering while advisory pipeline compilation is pending', async () => {
  const g = graphics();
  const renderer = await owner();
  const compile = deferred<void>();
  const original = g.device.createRenderPipelineAsync.getMockImplementation()!;
  g.device.createRenderPipelineAsync.mockImplementation(async (descriptor) => {
    const module = g.device.createShaderModule.mock.calls.find(
      (_, i) => g.device.createShaderModule.mock.results[i]!.value === descriptor.vertex.module
    )?.[0];
    if (module?.code === gpuPreviewShader(false, false, false, { clip: false, tint: true }))
      await compile.promise;
    return original(descriptor);
  });
  const pending = prepareOnly(renderer, request([{ ...layer(), tint: [1, 1, 1, 0.5] }]));
  await vi.waitFor(() => expect(g.device.popErrorScope).toHaveBeenCalledOnce());
  await renderer.render(request());
  expect(g.queue.submit).toHaveBeenCalledOnce();
  compile.resolve();
  await pending;
  await renderer.render(request([{ ...layer(), tint: [1, 1, 1, 0.5] }]));
  expect(mainPipelineCalls(g)).toHaveLength(2);
});

it('retains the device through both advisory compilation and validation settlement after disposal', async () => {
  const g = graphics();
  const renderer = await owner();
  const compile = deferred<void>(),
    validation = deferred<{ message: string } | null>();
  const original = g.device.createRenderPipelineAsync.getMockImplementation()!;
  g.device.createRenderPipelineAsync.mockImplementation(async (descriptor) => {
    await compile.promise;
    return original(descriptor);
  });
  g.device.popErrorScope.mockReturnValue(validation.promise);
  const pending = prepareOnly(renderer);
  const result = expect(pending).rejects.toThrow('GPU preview is disposed.');
  await vi.waitFor(() => expect(g.device.popErrorScope).toHaveBeenCalledOnce());
  renderer.dispose();
  expect(g.device.destroy).not.toHaveBeenCalled();
  compile.resolve();
  await Promise.resolve();
  expect(g.device.destroy).not.toHaveBeenCalled();
  validation.resolve(null);
  await result;
  expect(g.device.destroy).toHaveBeenCalledOnce();
});

it('keeps advisory validation failure isolated from unrelated foreground variants', async () => {
  const g = graphics();
  const renderer = await owner();
  g.device.popErrorScope.mockResolvedValueOnce({ message: 'invalid advisory shader' });
  await expect(prepareOnly(renderer)).rejects.toThrow('invalid advisory shader');
  await renderer.render(request([{ ...layer(), tint: [1, 1, 1, 0.5] }]));
  expect(g.queue.submit).toHaveBeenCalledOnce();
});

it('rejects invalid and aborted advisory graphs before pipeline work', async () => {
  const g = graphics();
  const renderer = await owner();
  const abort = new AbortController();
  abort.abort();
  expect(() => prepareOnly(renderer, request([], abort.signal))).toThrow();
  expect(() => prepareOnly(renderer, { ...request(), output: { width: 0, height: 36 } })).toThrow();
  expect(mainPipelineCalls(g)).toHaveLength(0);
  expect(g.device.pushErrorScope).not.toHaveBeenCalled();
});

it('snapshots queued advisory sources and drops an aborted launch without GPU work', async () => {
  const g = graphics();
  const renderer = await owner();
  const compile = deferred<void>();
  const original = g.device.createRenderPipelineAsync.getMockImplementation()!;
  g.device.createRenderPipelineAsync.mockImplementationOnce(async (descriptor) => {
    await compile.promise;
    return original(descriptor);
  });
  const foreground = renderer.render(request());
  await vi.waitFor(() => expect(mainPipelineCalls(g)).toHaveLength(1));
  const source = raster();
  const abort = new AbortController();
  const pending = prepareOnly(
    renderer,
    request([{ ...layer(source), tint: [1, 1, 1, 0.5] }], abort.signal)
  );
  const result = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  Object.defineProperty(source, 'width', {
    get: () => {
      throw new Error('released while queued');
    },
  });
  abort.abort();
  compile.resolve();
  await foreground;
  await result;
  expect(mainPipelineCalls(g)).toHaveLength(1);
  expect(g.queue.submit).toHaveBeenCalledOnce();
});

it('keeps advisory compilation owned when starting validation settlement throws', async () => {
  const g = graphics();
  const renderer = await owner();
  const compile = deferred<void>();
  const original = g.device.createRenderPipelineAsync.getMockImplementation()!;
  g.device.createRenderPipelineAsync.mockImplementation(async (descriptor) => {
    await compile.promise;
    return original(descriptor);
  });
  const failure = new Error('validation settlement unavailable');
  g.device.popErrorScope.mockImplementationOnce(() => {
    throw failure;
  });
  const pending = prepareOnly(renderer);
  const result = expect(pending).rejects.toBe(failure);
  renderer.dispose();
  expect(g.device.destroy).not.toHaveBeenCalled();
  compile.resolve();
  await result;
  expect(g.device.destroy).toHaveBeenCalledOnce();
});
