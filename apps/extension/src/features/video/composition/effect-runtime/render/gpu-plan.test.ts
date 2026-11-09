import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EffectRuntimeGpuPlanResult } from '../../../../../contracts/effect-runtime/types';
import type { GpuPreviewGroup, GpuPreviewRenderer } from '../../canvas/gpu-preview';
import { buildEffectRuntimeGpuPlan, prepareEffectRuntimeGpuScene } from './gpu-plan';
class Bitmap implements ImageBitmap {
  close = vi.fn();
  constructor(
    readonly width = 8,
    readonly height = 8
  ) {}
}
beforeEach(() => vi.stubGlobal('ImageBitmap', Bitmap));
afterEach(() => vi.unstubAllGlobals());
function plan(depth = 1): EffectRuntimeGpuPlanResult {
  return {
    kind: 'gpu-plan',
    effectInstanceId: 'effect',
    requestId: 'request',
    sequenceId: 1,
    snapshotId: 'snapshot',
    acknowledged: { documentId: 'a'.repeat(64), assetSelectionId: 'b'.repeat(64) },
    width: 8,
    height: 8,
    logicalWidth: 8,
    logicalHeight: 8,
    rootPass: depth - 1,
    inputResources: {},
    resources: [{ id: 0, kind: 'primitive', bitmap: new Bitmap(), width: 8, height: 8 }],
    passes: Array.from({ length: depth }, (_, id) => ({
      id,
      width: 8,
      height: 8,
      logicalWidth: 8,
      logicalHeight: 8,
      operations: [
        {
          op: 'draw',
          source: { kind: id === 0 ? 'resource' : 'pass', id: Math.max(0, id - 1) },
          sourceRect: { x: 0, y: 0, width: 8, height: 8 },
          destination: { x: 0, y: 0, width: 8, height: 8 },
          transform: [1, 0, 0, 1, 0, 0],
          alpha: 1,
          blend: 'source-over',
          filter: { blur: 0, brightness: 1, saturate: 1 },
          shadow: { color: [0, 0, 0, 0], blur: 0, offsetX: 0, offsetY: 0 },
        },
      ],
    })),
  };
}
const layer = (source: GpuPreviewGroup) => ({
  source,
  rect: { x: 0, y: 0, width: 8, height: 8 },
  inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1] as const,
});
function backend() {
  const render = vi.fn(async () => new Bitmap());
  const gpu: GpuPreviewRenderer = { allocatedBytes: 0, render, dispose: vi.fn() };
  return { gpu, render };
}
it('borrows checked primitives directly without intermediate GPU work or bitmap', async () => {
  const p = plan(),
    group = buildEffectRuntimeGpuPlan(p),
    layers = [layer(group)],
    { gpu, render } = backend();
  const prepared = await prepareEffectRuntimeGpuScene({
    layers,
    gpu,
    signal: new AbortController().signal,
  });
  expect(prepared.layers).toBe(layers);
  expect(render).not.toHaveBeenCalled();
  prepared.release();
  expect(p.resources[0]!.bitmap.close).not.toHaveBeenCalled();
});
it('compacts effective depth including editor wrappers on the same provider without mutating the graph', async () => {
  const p = plan(16),
    root = buildEffectRuntimeGpuPlan(p),
    original = root.layers;
  const wrapper: GpuPreviewGroup = {
    kind: 'group',
    output: { width: 8, height: 8 },
    logical: { width: 8, height: 8 },
    layers: [layer(root)],
  };
  const layers = [layer(wrapper)],
    { gpu, render } = backend();
  const prepared = await prepareEffectRuntimeGpuScene({
    layers,
    gpu,
    signal: new AbortController().signal,
  });
  expect(render).toHaveBeenCalledTimes(16);
  expect(root.layers).toBe(original);
  expect(layers[0]!.source).toBe(wrapper);
  expect(prepared.layers).not.toBe(layers);
  expect(p.resources[0]!.bitmap.close).not.toHaveBeenCalled();
  prepared.release();
  prepared.release();
  for (const result of render.mock.results)
    expect((await result.value).close).toHaveBeenCalledOnce();
});
it('releases partial materialization after cancellation', async () => {
  const p = plan(18),
    root = buildEffectRuntimeGpuPlan(p),
    abort = new AbortController(),
    { gpu, render } = backend();
  render.mockImplementationOnce(async () => {
    abort.abort();
    return new Bitmap();
  });
  await expect(
    prepareEffectRuntimeGpuScene({ layers: [layer(root)], gpu, signal: abort.signal })
  ).rejects.toThrow();
  expect((await render.mock.results[0]!.value).close).toHaveBeenCalledOnce();
  expect(p.resources[0]!.bitmap.close).not.toHaveBeenCalled();
});

it('keeps covered clear rectangles numeric when a pass also contains operation metadata', () => {
  const p = plan();
  p.resources.push({ id: 1, kind: 'coverage', bitmap: new Bitmap(), width: 8, height: 8 });
  p.passes[0]!.operations = [{ op: 'clear', coverage: 1 }];
  const group = buildEffectRuntimeGpuPlan(p);
  expect(group.layers[0]!.rect).toEqual({ x: 0, y: 0, width: 8, height: 8 });
  expect(Object.values(group.layers[0]!.rect).every(Number.isFinite)).toBe(true);
});
