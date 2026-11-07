// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createNativeEffectPreparation } from './effect-preparation';
import type { PreviewSceneRenderInput } from './types';
import type {
  EffectRuntimeGpuPlanResult,
  EffectRuntimeRenderCommand,
  EffectRuntimeSandboxExecutor,
} from '../../../../contracts/effect-runtime/types';
import type { GpuPreviewRenderer } from '../../../../features/video/composition/canvas/gpu-preview';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { resolveVideoCompositionFrame } from '../../../../features/video/composition/timeline/frame';
const io = vi.hoisted(() => ({ next: vi.fn(), resolve: vi.fn(), wrap: vi.fn() }));
vi.mock('./frame-plan', () => ({
  resolveUpcomingNativeEffectOnset: io.next,
  resolveUpcomingNativeEffect: io.resolve,
}));
vi.mock('./gpu-preview-layers', () => ({ buildNativeGpuEffectLayer: io.wrap }));
class Bitmap implements ImageBitmap {
  close = vi.fn();
  constructor(
    readonly width = 8,
    readonly height = 4
  ) {}
}
beforeEach(() => {
  vi.stubGlobal('ImageBitmap', Bitmap);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        public width: number,
        public height: number
      ) {}
    }
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function fixture() {
  const project = createProject([
    createVideoClip({ id: 'source', duration: 5, sourceDuration: 5 }),
  ]);
  const contextController = new AbortController();
  const frameController = new AbortController();
  const context = { project, signal: contextController.signal };
  const input: PreviewSceneRenderInput = {
    project: { ...project },
    currentTime: 1,
    canvas: document.createElement('canvas'),
    stage: null,
    videoRefs: { current: {} },
    imageBank: {},
    previewRasterSize: { width: 8, height: 4 },
    previewRenderer: 'gpu',
    signal: frameController.signal,
    effectPreparation: { context, project, time: 1 },
    effectRuntimeExecutor: vi.fn<() => EffectRuntimeSandboxExecutor>(),
  };
  input.effectPreparation!.project = input.project;
  const plan = {
    effectInstanceId: 'annotation',
    snapshotId: 'effect:' + 'a'.repeat(64),
    documentSha256: 'a'.repeat(64),
    documentSource: '{}',
    assets: [],
    controls: {},
    dimensions: { width: 8, height: 4 },
    renderDimensions: { width: 8, height: 4 },
    duration: 1,
    fps: 30,
    frameIndex: 1,
    progress: 0.1,
    time: 0.1,
    kind: 'standalone' as const,
    target: { kind: 'scene' as const, clipId: 'annotation' },
  };
  const candidate = {
    onset: 2,
    time: 2 + 1 / 30,
    plan,
    layer: resolveVideoCompositionFrame(project, 2).visualLayers[0]!,
    fullFrame: false as const,
    logical: { width: 8, height: 4 },
    output: { width: 8, height: 4 },
  };
  io.next.mockReturnValue({
    clipId: 'annotation',
    effectInstanceId: 'annotation',
    onset: 2,
    time: candidate.time,
  });
  io.resolve.mockReturnValue(candidate);
  io.wrap.mockImplementation(({ frame }) => ({
    source: frame.source,
    rect: { x: 0, y: 0, width: 8, height: 4 },
    inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  }));
  const bitmap = new Bitmap();
  const packet = (
    request: EffectRuntimeRenderCommand,
    bitmaps = [bitmap]
  ): EffectRuntimeGpuPlanResult => ({
    kind: 'gpu-plan',
    effectInstanceId: request.effectInstanceId,
    requestId: request.requestId,
    snapshotId: request.snapshotId,
    sequenceId: request.sequenceId,
    acknowledged: {
      documentId: request.documentRef.id,
      assetSelectionId: request.assetSelectionRef.id,
    },
    width: 8,
    height: 4,
    logicalWidth: 8,
    logicalHeight: 4,
    rootPass: 0,
    inputResources: {},
    resources: bitmaps.map((bitmap, id) => ({
      id,
      kind: 'primitive',
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
    })),
    passes: [{ id: 0, width: 8, height: 4, logicalWidth: 8, logicalHeight: 4, operations: [] }],
  });
  const executor = {
    dispose: vi.fn(),
    renderFrame: vi.fn(),
    prepareGpuFrame: vi.fn(async (request: EffectRuntimeRenderCommand) => packet(request)),
  } satisfies EffectRuntimeSandboxExecutor;
  const create = vi.fn(() => executor);
  const preparePipelines = vi.fn<NonNullable<GpuPreviewRenderer['preparePipelines']>>(
    async () => {}
  );
  const provider: GpuPreviewRenderer = {
    allocatedBytes: 0,
    render: vi.fn(),
    dispose: vi.fn(),
    preparePipelines,
  };
  const owner = createNativeEffectPreparation(create);
  return {
    owner,
    input,
    context,
    contextController,
    frameController,
    create,
    executor,
    bitmap,
    packet,
    provider,
    preparePipelines,
    candidate,
  };
}
it('prepares on the actual provider once and releases packet pixels before compilation settles', async () => {
  const f = fixture();
  const compile = Promise.withResolvers<void>();
  f.preparePipelines.mockImplementation(() => compile.promise);
  f.owner.update(f.input, f.provider);
  await vi.waitFor(() => expect(f.preparePipelines).toHaveBeenCalledOnce());
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  f.owner.update(
    { ...f.input, effectPreparation: { context: f.context, project: f.input.project, time: 1.1 } },
    f.provider
  );
  expect(io.resolve).toHaveBeenCalledOnce();
  expect(io.resolve.mock.calls[0]![0].project).toBe(f.input.effectPreparation!.project);
  expect(f.create).toHaveBeenCalledExactlyOnceWith(document);
  expect(f.input.effectRuntimeExecutor).not.toHaveBeenCalled();
  f.frameController.abort();
  expect(f.executor.dispose).not.toHaveBeenCalled();
  compile.resolve();
  await vi.waitFor(() => expect(f.executor.dispose).toHaveBeenCalledOnce());
  f.owner.dispose();
});
it.each(['context', 'onset', 'dispose'] as const)(
  'closes late isolated output after %s retirement without compiling it',
  async (reason) => {
    const f = fixture();
    const response = Promise.withResolvers<EffectRuntimeGpuPlanResult>();
    f.executor.prepareGpuFrame.mockReturnValue(response.promise);
    f.owner.update(f.input, f.provider);
    await vi.waitFor(() => expect(f.executor.prepareGpuFrame).toHaveBeenCalledOnce());
    if (reason === 'context') f.contextController.abort();
    if (reason === 'dispose') f.owner.dispose();
    if (reason === 'onset') {
      io.next.mockReturnValue(null);
      f.owner.update(
        {
          ...f.input,
          effectPreparation: { context: f.context, project: f.input.project, time: 2 },
        },
        f.provider
      );
    }
    expect(f.executor.dispose).toHaveBeenCalledOnce();
    response.resolve(f.packet(f.executor.prepareGpuFrame.mock.calls[0]![0]));
    await vi.waitFor(() => expect(f.bitmap.close).toHaveBeenCalledOnce());
    expect(f.preparePipelines).not.toHaveBeenCalled();
    f.owner.dispose();
  }
);
it('does not retry a failed event and refuses a packet above the existing 128 MiB bound', async () => {
  const f = fixture();
  const bitmaps = Array.from({ length: 17 }, () => new Bitmap(1904, 1072));
  f.executor.prepareGpuFrame.mockImplementation(async (request) => f.packet(request, bitmaps));
  f.owner.update(f.input, f.provider);
  await vi.waitFor(() => expect(f.executor.dispose).toHaveBeenCalledOnce());
  f.owner.update(f.input, f.provider);
  expect(io.resolve).toHaveBeenCalledOnce();
  expect(f.create).toHaveBeenCalledOnce();
  expect(f.preparePipelines).not.toHaveBeenCalled();
  for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
  f.owner.dispose();
});
it.each(['untrusted', 'paused', 'cache', 'legacy'] as const)(
  'does not evaluate a prospective graph for %s consumers',
  (kind) => {
    const f = fixture();
    const owner = kind === 'untrusted' ? createNativeEffectPreparation() : f.owner;
    const input = { ...f.input };
    if (kind === 'paused') delete input.effectPreparation;
    if (kind === 'cache') input.previewMode = 'cache';
    if (kind === 'legacy') input.previewRenderer = 'legacy';
    owner.update(input, f.provider);
    expect(io.next).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.input.effectRuntimeExecutor).not.toHaveBeenCalled();
    owner.dispose();
    f.owner.dispose();
  }
);

it('retires an outstanding compilation without retaining pixels or awaiting its settlement', async () => {
  const f = fixture();
  const compile = Promise.withResolvers<void>();
  f.preparePipelines.mockReturnValue(compile.promise);
  f.owner.update(f.input, f.provider);
  await vi.waitFor(() => expect(f.preparePipelines).toHaveBeenCalledOnce());
  const signal = f.preparePipelines.mock.calls[0]![0].signal;
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  f.contextController.abort();
  expect(signal.aborted).toBe(true);
  expect(f.executor.dispose).toHaveBeenCalledOnce();
  compile.reject(new Error('retired compilation'));
  await Promise.resolve();
  await Promise.resolve();
  expect(f.input.effectRuntimeExecutor).not.toHaveBeenCalled();
  f.owner.dispose();
});

it('keeps one flight when publication-anchor and CSS sizes change under a fixed semantic raster', async () => {
  const f = fixture();
  const gate = Promise.withResolvers<void>();
  f.input.previewRasterSize = { width: 1904, height: 1072 };
  f.executor.prepareGpuFrame.mockImplementation(async (request) => {
    await gate.promise;
    return f.packet(request, [new Bitmap()]);
  });
  f.owner.update(f.input, f.provider);
  await vi.waitFor(() => expect(f.executor.prepareGpuFrame).toHaveBeenCalledOnce());
  try {
    f.input.canvas.width = 1904;
    f.input.canvas.height = 1072;
    f.input.stage = document.createElement('div');
    Object.defineProperties(f.input.stage, {
      clientWidth: { value: 782 },
      clientHeight: { value: 440 },
    });
    f.owner.update(f.input, f.provider);
    expect(f.executor.dispose).not.toHaveBeenCalled();
    expect(f.create).toHaveBeenCalledOnce();
    expect(io.resolve).toHaveBeenCalledOnce();
  } finally {
    f.owner.dispose();
    gate.resolve();
  }
});

it('uses hydrated data with stable authored identity and one attempt per event', async () => {
  const f = fixture();
  const hydrated = { ...f.input.project, fps: 24 };
  const preparation = { context: f.context, project: hydrated, time: 1.1 };
  f.owner.update({ ...f.input, effectPreparation: preparation }, f.provider);
  await vi.waitFor(() => expect(f.preparePipelines).toHaveBeenCalledOnce());
  expect(io.resolve.mock.calls[0]![0].project).toBe(hydrated);
  expect(io.next.mock.calls[0]![0]).toBe(hydrated);
  expect(f.context.project).not.toBe(hydrated);
  f.owner.update(
    { ...f.input, effectPreparation: { ...preparation, project: { ...hydrated }, time: 1.2 } },
    f.provider
  );
  expect(io.resolve).toHaveBeenCalledOnce();
  expect(f.create).toHaveBeenCalledOnce();
  f.owner.dispose();
});
