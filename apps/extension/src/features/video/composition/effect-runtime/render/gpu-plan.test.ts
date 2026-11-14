import type { EffectRuntimeGpuRasterResource } from '../../../../../contracts/effect-runtime/gpu-plan';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EffectRuntimeGpuPlanResult } from '../../../../../contracts/effect-runtime/types';
import type {
  GpuPreviewGroup,
  GpuPreviewLayer,
  GpuPreviewRenderer,
} from '../../canvas/gpu-preview';
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
function plan(
  depth = 1
): EffectRuntimeGpuPlanResult & { resources: EffectRuntimeGpuRasterResource[] } {
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
  const render = vi.fn<GpuPreviewRenderer['render']>(async () => new Bitmap());
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

it('keeps closed paint and coverage in the shared graph without materialization', async () => {
  const p: EffectRuntimeGpuPlanResult = plan();
  const paint = {
    path: [],
    draw: { op: 'fillRect' as const, args: [0, 0, 8, 8] },
    transform: [1, 0, 0, 1, 0, 0] as const,
    style: {
      fill: '#ffffff',
      stroke: '#000000',
      font: '10px sans-serif',
      lineWidth: 1,
      lineCap: 'butt' as const,
      lineJoin: 'miter' as const,
      miterLimit: 10,
      textAlign: 'start' as const,
      textBaseline: 'alphabetic' as const,
      direction: 'inherit' as const,
    },
  };
  p.resources = [
    { id: 0, kind: 'paint', width: 8, height: 8, paint },
    { id: 1, kind: 'paint', width: 8, height: 8, coverage: true, paint },
  ];
  const operation = p.passes[0]!.operations[0]!;
  if (operation.op !== 'draw') throw new Error('Expected draw');
  operation.coverage = 1;
  const root = buildEffectRuntimeGpuPlan(p);
  const { gpu, render } = backend();
  const prepared = await prepareEffectRuntimeGpuScene({
    layers: [layer(root)],
    gpu,
    signal: new AbortController().signal,
  });
  expect(root.layers[0]!.source).toMatchObject({ kind: 'paint', width: 8, height: 8, paint });
  expect(root.layers[0]!.operationClip?.source).toMatchObject({
    kind: 'paint',
    width: 8,
    height: 8,
    paint,
  });
  expect(render).not.toHaveBeenCalled();
  prepared.release();
  prepared.release();
});

function largeGpuScene(count = 4, width = 2048): GpuPreviewLayer[] {
  const size = { width, height: 2048 };
  return Array.from({ length: count }, () => {
    let source: GpuPreviewLayer['source'] = new Bitmap(size.width, size.height);
    for (let depth = 0; depth < 4; depth++)
      source = {
        kind: 'group',
        output: size,
        logical: size,
        layers: [{ source, rect: { x: 0, y: 0, ...size }, inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1] }],
      };
    if (!('kind' in source) || source.kind !== 'group') throw new Error('Expected group fixture');
    return {
      ...layer(source),
      opacity: 0.75,
      clip: { rect: { x: 0, y: 0, width: 8, height: 8 }, radius: 2 },
    };
  });
}

it('stages a large isolated group on the same GPU before the final texture budget is exceeded', async () => {
  const layers = largeGpuScene();
  const { gpu, render } = backend();
  render.mockImplementation(
    async (request) => new Bitmap(request.output.width, request.output.height)
  );
  const prepared = await prepareEffectRuntimeGpuScene({
    boundTextures: true,
    layers,
    gpu,
    signal: new AbortController().signal,
  });
  try {
    expect(render).toHaveBeenCalledOnce();
    expect(render.mock.calls[0]![0].output).toEqual({ width: 2048, height: 2048 });
    expect(prepared.layers[0]!.source).toBeInstanceOf(Bitmap);
    expect({ ...prepared.layers[0], source: layers[0]!.source }).toEqual(layers[0]);
    expect(prepared.layers.slice(1)).toEqual(layers.slice(1));
    expect((await render.mock.results[0]!.value).close).not.toHaveBeenCalled();
  } finally {
    prepared.release();
  }
  expect((await render.mock.results[0]!.value).close).toHaveBeenCalledOnce();
});

it('closes completed stages when a later GPU stage fails', async () => {
  const layers = largeGpuScene(5);
  const { gpu, render } = backend();
  const first = new Bitmap(2048, 2048);
  const failure = new Error('GPU stage failed');
  render.mockResolvedValueOnce(first).mockRejectedValueOnce(failure);
  await expect(
    prepareEffectRuntimeGpuScene({
      boundTextures: true,
      layers,
      gpu,
      signal: new AbortController().signal,
    })
  ).rejects.toBe(failure);
  expect(first.close).toHaveBeenCalledOnce();
});

it('closes a stage completed after cancellation without publishing the replacement', async () => {
  const controller = new AbortController();
  const { gpu, render } = backend();
  const late = new Bitmap(2048, 2048);
  render.mockImplementationOnce(async () => {
    controller.abort();
    return late;
  });
  await expect(
    prepareEffectRuntimeGpuScene({
      boundTextures: true,
      layers: largeGpuScene(),
      gpu,
      signal: controller.signal,
    })
  ).rejects.toThrow();
  expect(late.close).toHaveBeenCalledOnce();
});

it('keeps retained GPU stage bitmaps within the existing 128MiB limit', async () => {
  const { gpu, render } = backend();
  const outputs: Bitmap[] = [];
  render.mockImplementation(async (request) => {
    const bitmap = new Bitmap(request.output.width, request.output.height);
    outputs.push(bitmap);
    return bitmap;
  });
  await expect(
    prepareEffectRuntimeGpuScene({
      boundTextures: true,
      layers: largeGpuScene(10, 4000),
      gpu,
      signal: new AbortController().signal,
    })
  ).rejects.toThrow();
  expect(outputs).toHaveLength(4);
  expect(outputs.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
});
