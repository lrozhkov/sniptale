import { expect, it, vi } from 'vitest';
import type {
  EffectRuntimeGpuDraw,
  EffectRuntimeGpuPass,
} from '../../contracts/effect-runtime/gpu-plan';
import type { EffectRuntimeGpuPlanResult } from '../../contracts/effect-runtime/types';
import {
  GpuPreviewDeviceError,
  type GpuPreviewRenderer,
} from '../../features/video/composition/canvas/gpu-preview';
import { createEffectRuntimeGpuPlanRenderer } from './gpu-plan-renderer';
class Bitmap implements ImageBitmap {
  close = vi.fn();
  constructor(
    readonly width = 10,
    readonly height = 10
  ) {}
}
function draw(): EffectRuntimeGpuDraw {
  return {
    op: 'draw',
    source: { kind: 'resource', id: 0 },
    sourceRect: { x: 0, y: 0, width: 10, height: 10 },
    destination: { x: 0, y: 0, width: 10, height: 10 },
    transform: [1, 0, 0, 1, 0, 0],
    alpha: 1,
    blend: 'source-over',
    filter: { blur: 0, brightness: 1, saturate: 1 },
    shadow: { color: [0, 0, 0, 0], blur: 0, offsetX: 0, offsetY: 0 },
  };
}
function pass(id = 0, count = 1): EffectRuntimeGpuPass {
  return {
    id,
    width: 10,
    height: 10,
    logicalWidth: 10,
    logicalHeight: 10,
    operations: Array.from({ length: count }, draw),
  };
}
function plan(): EffectRuntimeGpuPlanResult {
  return {
    kind: 'gpu-plan',
    effectInstanceId: 'effect',
    requestId: 'request',
    snapshotId: 'snapshot',
    sequenceId: 1,
    acknowledged: { assetSelectionId: 'a'.repeat(64), documentId: 'b'.repeat(64) },
    width: 10,
    height: 10,
    logicalWidth: 10,
    logicalHeight: 10,
    resources: [{ id: 0, kind: 'input', bitmap: new Bitmap(), width: 10, height: 10 }],
    inputResources: { source: 0 },
    passes: [pass()],
    rootPass: 0,
  };
}
function backend() {
  const outputs: Bitmap[] = [];
  const render = vi.fn<GpuPreviewRenderer['render']>(async ({ output }) => {
    const bitmap = new Bitmap(output.width, output.height);
    outputs.push(bitmap);
    return bitmap;
  });
  return { outputs, render, dispose: vi.fn(), allocatedBytes: 0 };
}
it('memoizes lazy availability and hands the final root bitmap to its caller', async () => {
  const gpu = backend();
  const factory = vi.fn(async () => gpu);
  const renderer = createEffectRuntimeGpuPlanRenderer({ rendererFactory: factory });
  expect(factory).not.toHaveBeenCalled();
  expect(await renderer.isAvailable()).toBe(true);
  expect(await renderer.isAvailable()).toBe(true);
  const p = plan();
  const result = await renderer.render(p, new AbortController().signal);
  expect(factory).toHaveBeenCalledOnce();
  expect(result).toBe(gpu.outputs[0]);
  expect(result.close).not.toHaveBeenCalled();
  expect(p.resources[0]!.bitmap.close).not.toHaveBeenCalled();
  renderer.dispose();
  expect(gpu.dispose).toHaveBeenCalledOnce();
  expect(result.close).not.toHaveBeenCalled();
});
it('chunks a large admitted operation list without imposing the core frame limit on the plan', async () => {
  const gpu = backend();
  const renderer = createEffectRuntimeGpuPlanRenderer({ rendererFactory: async () => gpu });
  const p = plan();
  p.passes = [pass(0, 1200)];
  const output = await renderer.render(p, new AbortController().signal);
  expect(gpu.render.mock.calls.length).toBeGreaterThan(8);
  expect(gpu.render.mock.calls.every(([args]) => args.layers.length <= 64)).toBe(true);
  for (const bitmap of gpu.outputs)
    expect(bitmap.close).toHaveBeenCalledTimes(bitmap === output ? 0 : 1);
  expect(gpu.render.mock.calls[1]![0].layers[0]!.source).toBe(gpu.outputs[0]);
  expect(gpu.render.mock.calls[1]![0].layers[0]!.rect).toEqual({
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  });
});
it('renders topological pass snapshots and releases sources only after their last consumer fence', async () => {
  const gpu = backend();
  const p = plan();
  p.passes = [
    pass(0),
    { ...pass(1), operations: [{ ...draw(), source: { kind: 'pass', id: 0 } }] },
    {
      ...pass(2),
      operations: [
        { ...draw(), source: { kind: 'pass', id: 0 } },
        { ...draw(), source: { kind: 'pass', id: 1 } },
      ],
    },
  ];
  p.rootPass = 2;
  let index = 0;
  const original = gpu.render.getMockImplementation()!;
  gpu.render.mockImplementation(async (args) => {
    if (index++ === 2) {
      expect(gpu.outputs[0]!.close).not.toHaveBeenCalled();
      expect(gpu.outputs[1]!.close).not.toHaveBeenCalled();
    }
    return original(args);
  });
  const renderer = createEffectRuntimeGpuPlanRenderer({ rendererFactory: async () => gpu });
  const output = await renderer.render(p, new AbortController().signal);
  expect(gpu.outputs[0]!.close).toHaveBeenCalledOnce();
  expect(gpu.outputs[1]!.close).toHaveBeenCalledOnce();
  expect(output.close).not.toHaveBeenCalled();
});
it('resets queued layers for full clear and still materializes an empty transparent pass', async () => {
  const gpu = backend();
  const p = plan();
  p.passes[0]!.operations = [...Array.from({ length: 70 }, draw), { op: 'clear' }];
  const renderer = createEffectRuntimeGpuPlanRenderer({ rendererFactory: async () => gpu });
  await renderer.render(p, new AbortController().signal);
  expect(gpu.render.mock.calls.at(-1)![0].layers).toEqual([]);
  expect(gpu.outputs[0]!.close).toHaveBeenCalledOnce();
});
it('waits for an in-flight render to settle before abort cleanup and never publishes its bitmap', async () => {
  const gpu = backend();
  let finish: ((bitmap: ImageBitmap) => void) | undefined;
  let entered: (() => void) | undefined;
  const submitted = new Promise<void>((resolve) => {
    entered = resolve;
  });
  gpu.render.mockImplementation(() => {
    entered!();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const renderer = createEffectRuntimeGpuPlanRenderer({ rendererFactory: async () => gpu });
  const p = plan();
  const controller = new AbortController();
  const pending = renderer.render(p, controller.signal);
  const rejected = expect(pending).rejects.toThrow();
  await submitted;
  controller.abort();
  const bitmap = new Bitmap();
  expect(bitmap.close).not.toHaveBeenCalled();
  finish!(bitmap);
  await rejected;
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(p.resources[0]!.bitmap.close).not.toHaveBeenCalled();
});
it('cleans completed chunks on render failure and suppresses availability only for device errors', async () => {
  const gpu = backend();
  const renderer = createEffectRuntimeGpuPlanRenderer({ rendererFactory: async () => gpu });
  const p = plan();
  p.passes = [pass(0, 100)];
  const error = new Error('invalid plan');
  gpu.render.mockRejectedValueOnce(error);
  await expect(renderer.render(p, new AbortController().signal)).rejects.toBe(error);
  expect(await renderer.isAvailable()).toBe(true);
  const original = gpu.render.getMockImplementation()!;
  gpu.render
    .mockImplementationOnce(original)
    .mockRejectedValueOnce(new GpuPreviewDeviceError('lost'));
  await expect(renderer.render(p, new AbortController().signal)).rejects.toBeInstanceOf(
    GpuPreviewDeviceError
  );
  for (const bitmap of gpu.outputs) expect(bitmap.close).toHaveBeenCalledOnce();
  expect(await renderer.isAvailable()).toBe(false);
  expect(p.resources[0]!.bitmap.close).not.toHaveBeenCalled();
});
it('reports missing devices, retains ordinary creation failures and disposes a late device exactly once', async () => {
  const unavailable = createEffectRuntimeGpuPlanRenderer({ rendererFactory: async () => null });
  expect(await unavailable.isAvailable()).toBe(false);
  await expect(unavailable.render(plan(), new AbortController().signal)).rejects.toBeInstanceOf(
    GpuPreviewDeviceError
  );
  const error = new Error('validation');
  const failed = createEffectRuntimeGpuPlanRenderer({
    rendererFactory: async () => {
      throw error;
    },
  });
  await expect(failed.isAvailable()).rejects.toBe(error);
  const gpu = backend();
  let finish: ((value: GpuPreviewRenderer) => void) | undefined;
  const late = createEffectRuntimeGpuPlanRenderer({
    rendererFactory: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const availability = late.isAvailable();
  const rejection = expect(availability).rejects.toThrow('disposed');
  late.dispose();
  finish!(gpu);
  await rejection;
  expect(gpu.dispose).toHaveBeenCalledOnce();
});
it('applies the existing byte budget to transient chunk outputs without permitting Canvas retry', async () => {
  const gpu = backend();
  const renderer = createEffectRuntimeGpuPlanRenderer({ rendererFactory: async () => gpu });
  const p = plan();
  p.resources = Array.from({ length: 3 }, (_, id) => ({
    id,
    kind: 'input',
    bitmap: new Bitmap(3840, 2160),
    width: 3840,
    height: 2160,
  }));
  p.passes = [{ ...pass(0, 70), width: 3840, height: 2160 }];
  const pending = renderer.render(p, new AbortController().signal);
  await expect(pending).rejects.toMatchObject({ code: 'runtimeResourceLimit' });
  expect(gpu.render).toHaveBeenCalledOnce();
  expect(gpu.outputs[0]!.close).toHaveBeenCalledOnce();
  expect(await renderer.isAvailable()).toBe(true);
});
it('aborts disposal through the fence and rejects concurrency while retaining borrowed inputs', async () => {
  const gpu = backend();
  let finish: ((bitmap: ImageBitmap) => void) | undefined;
  let enter: (() => void) | undefined;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  gpu.render.mockImplementation(() => {
    enter!();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const renderer = createEffectRuntimeGpuPlanRenderer({ rendererFactory: async () => gpu });
  const p = plan();
  const pending = renderer.render(p, new AbortController().signal);
  const rejected = expect(pending).rejects.toThrow();
  await entered;
  await expect(renderer.render(p, new AbortController().signal)).rejects.toThrow('in flight');
  renderer.dispose();
  expect(gpu.dispose).toHaveBeenCalledOnce();
  expect(p.resources[0]!.bitmap.close).not.toHaveBeenCalled();
  const bitmap = new Bitmap();
  finish!(bitmap);
  await rejected;
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(await renderer.isAvailable()).toBe(false);
});
