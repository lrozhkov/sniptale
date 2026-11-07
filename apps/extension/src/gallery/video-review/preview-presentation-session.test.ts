// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createManualPresentationOwner } from './preview-presentation-session';
import type { GpuPreviewRenderer } from '../../features/video/composition/canvas/gpu-preview';
import type { PreviewGpuCanvasFactory } from '../../workflows/video-review/preview-render-resources';
const io = vi.hoisted(() => ({
  renderer:
    vi.fn<
      (
        args: Parameters<
          typeof import('../../workflows/video-review/render-preview').createReviewPreviewRenderer
        >[0]
      ) => { dispose(): void; maximumInFlight(): 1 | 2 }
    >(),
  executor:
    vi.fn<
      typeof import('../../workflows/video/effect-runtime-sandbox').createEffectRuntimeSandboxExecutor
    >(),
  dispose: vi.fn(),
  presentation: vi.fn<typeof import('./preview-presentation').createReviewPreviewPresentation>(),
}));
vi.mock('../../workflows/video-review/render-preview', () => ({
  createReviewPreviewRenderer: io.renderer,
}));
vi.mock('../../workflows/video/effect-runtime-sandbox', () => ({
  createEffectRuntimeSandboxExecutor: io.executor,
}));
vi.mock('./preview-presentation', () => ({
  createReviewPresentationPaintClock: () => ({}),
  createReviewPreviewPresentation: io.presentation.mockImplementation(() => ({
    dispose: vi.fn(),
    invalidate: vi.fn(),
    update: vi.fn(),
  })),
}));

afterEach(() => {
  io.renderer.mockClear();
  io.presentation.mockClear();
  io.dispose.mockClear();
  io.executor.mockClear();
});

it('keeps GPU targets hidden until pixels and geometry are ready', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const onGeometry = vi.fn();
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const size = { width: 10, height: 10 };
  const surfaceDispose = vi.fn();
  const backend: GpuPreviewRenderer = {
    allocatedBytes: 0,
    render: vi.fn<GpuPreviewRenderer['render']>(),
    dispose: vi.fn(),
    createSurface: (canvas) => ({ canvas, present: async () => {}, dispose: surfaceDispose }),
  };
  const renderPresentation = vi.fn(
    async (
      _prepared: unknown,
      _frame: unknown,
      _signal: AbortSignal,
      acquire: PreviewGpuCanvasFactory
    ) => {
      const target = acquire(size, backend);
      expect(target.canvas.parentElement).toBe(host);
      expect(target.canvas.style.opacity).toBe('0');
      expect(target.canvas.style.backgroundColor).toBe('rgb(0, 0, 0)');
      await pending;
      return {
        canvas: target.canvas,
        release: target.release,
        outputKind: 'gpu-surface' as const,
        retainedProviderBytes: () => 800,
        isRetiredProvider: () => false,
        geometry: null,
        sourceTime: 1,
        captionConflicts: [],
        renderer: { backend: 'gpu' as const },
      };
    }
  );
  io.renderer.mockReturnValue(
    Object.assign({ dispose: vi.fn(), maximumInFlight: () => 2 }, { renderPresentation })
  );
  const latest = () => ({
    input: {
      video: { current: null },
      host: { current: host },
      sourceIdentity: 'source',
      preferences: { renderer: 'gpu' },
      onGeometry,
    },
    placement: null,
  });
  const owner = createManualPresentationOwner(
    latest as unknown as Parameters<typeof createManualPresentationOwner>[0],
    vi.fn(),
    vi.fn(),
    vi.fn()
  );
  io.renderer.mock.lastCall![0].allocation!.replaceLimits({
    maximumManagedBytes: 10000,
    maximumCanvases: 3,
  });
  const hooks = io.presentation.mock.lastCall![0];
  const request = { scene: {}, generation: 'test', quality: 'selected' as const, time: 1 };
  const rendered = Promise.resolve(
    hooks.render({ watermarkBounds: null }, {}, request, new AbortController().signal)
  );
  await Promise.resolve();
  expect(host.querySelector('[data-preview-front="true"]')).toBeNull();
  expect(onGeometry).not.toHaveBeenCalled();
  finish();
  const completed = await rendered;
  hooks.publish(completed.value, request);
  expect(host.querySelector('[data-preview-front="true"]')).not.toBeNull();
  expect(onGeometry).toHaveBeenCalledWith(null, 1, 'source');
  completed.release();
  const next = await Promise.all([
    hooks.render({ watermarkBounds: null }, {}, request, new AbortController().signal),
    hooks.render({ watermarkBounds: null }, {}, request, new AbortController().signal),
  ]);
  expect(host.children).toHaveLength(3);
  for (const frame of next) {
    hooks.publish(frame.value, request);
    frame.release();
  }
  const warmed = [...host.children];
  const mutations: MutationRecord[] = [];
  const changes = new MutationObserver((records) => mutations.push(...records));
  changes.observe(host, { childList: true });
  const reused = await hooks.render(
    { watermarkBounds: null },
    {},
    request,
    new AbortController().signal
  );
  hooks.publish(reused.value, request);
  reused.release();
  expect([...host.children]).toEqual(warmed);
  expect([...mutations, ...changes.takeRecords()]).toHaveLength(0);
  changes.disconnect();
  owner.dispose();
  expect(surfaceDispose).toHaveBeenCalledTimes(3);
  host.remove();
});
it('selects the Gallery GPU annotation sandbox and preserves retry teardown', () => {
  io.renderer.mockReturnValue({ dispose: io.dispose, maximumInFlight: () => 2 });
  const readAsset = vi.fn();
  const latest = () => ({
    input: { video: { current: null }, readAsset, preferences: { renderer: 'gpu' } },
    placement: null,
  });
  const owner = createManualPresentationOwner(
    latest as unknown as Parameters<typeof createManualPresentationOwner>[0],
    vi.fn(),
    vi.fn(),
    vi.fn()
  );
  const args = io.renderer.mock.calls[0]![0];
  expect(args.readAsset).toBe(readAsset);
  expect(args.annotationExecutor).toBeTypeOf('function');
  args.annotationExecutor!();
  expect(io.executor).toHaveBeenCalledWith({ compositionBackend: 'gpu-scene' });
  expect(args.annotationWarmExecutor).toBeTypeOf('function');
  owner.dispose();
  owner.dispose();
  expect(io.dispose).toHaveBeenCalledOnce();
});

it('releases its original source clock on device failure and disposal after the latest source changes', () => {
  io.renderer.mockReturnValue({ dispose: io.dispose, maximumInFlight: () => 2 });
  const active = vi.fn();
  const input = {
    sourceIdentity: 'first',
    video: { current: null },
    playing: true,
    onPresentationActive: active,
    preferences: { frameRate: 'current', pausedQuality: 'same' },
    pausedResultTime: 0,
  };
  const latest = () => ({ input, placement: null });
  const owner = createManualPresentationOwner(
    latest as unknown as Parameters<typeof createManualPresentationOwner>[0],
    vi.fn(),
    vi.fn(),
    vi.fn()
  );
  owner.update({} as Parameters<typeof owner.update>[0], 1, false);
  expect(active).toHaveBeenLastCalledWith('first', true);
  io.renderer.mock.lastCall![0].onContextLost!();
  expect(active).toHaveBeenLastCalledWith('first', false);
  owner.retry();
  expect(active).toHaveBeenLastCalledWith('first', true);
  input.sourceIdentity = 'second';
  owner.dispose();
  expect(active).toHaveBeenLastCalledWith('first', false);
});

it('selects the Standard Gallery annotation path without GPU composition', () => {
  io.renderer.mockClear();
  io.executor.mockClear();
  io.renderer.mockReturnValue({ dispose: vi.fn(), maximumInFlight: () => 2 });
  const latest = () => ({
    input: { video: { current: null }, preferences: { renderer: 'legacy' } },
    placement: null,
  });
  const owner = createManualPresentationOwner(
    latest as unknown as Parameters<typeof createManualPresentationOwner>[0],
    vi.fn(),
    vi.fn(),
    vi.fn()
  );
  const args = io.renderer.mock.calls[0]![0];
  expect(args.renderer).toBe('legacy');
  expect(args.annotationWarmExecutor).toBeUndefined();
  args.annotationExecutor!();
  expect(io.executor).toHaveBeenCalledExactlyOnceWith({});
  owner.dispose();
});

it('uses the explicit plan-only factory only while GPU playback is active', () => {
  io.renderer.mockReturnValue({ dispose: vi.fn(), maximumInFlight: () => 2 });
  const input = {
    video: { current: null },
    playing: true,
    preferences: { renderer: 'gpu', frameRate: 'current', pausedQuality: 'same' },
    pausedResultTime: 0,
  };
  const owner = createManualPresentationOwner(
    (() => ({ input, placement: null })) as unknown as Parameters<
      typeof createManualPresentationOwner
    >[0],
    vi.fn(),
    vi.fn(),
    vi.fn()
  );
  const args = io.renderer.mock.lastCall![0];
  args.annotationWarmExecutor!();
  expect(io.executor).not.toHaveBeenCalled();
  owner.update({} as Parameters<typeof owner.update>[0], 1, false);
  args.annotationWarmExecutor!();
  expect(io.executor).toHaveBeenCalledExactlyOnceWith({ compositionBackend: 'gpu-scene-plan' });
  owner.dispose();
});
