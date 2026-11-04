import { expect, it, vi } from 'vitest';
import { createManualPresentationOwner } from './preview-presentation-session';
const io = vi.hoisted(() => ({
  renderer:
    vi.fn<
      (
        args: Parameters<
          typeof import('../../workflows/video-review/render-preview').createReviewPreviewRenderer
        >[0]
      ) => { dispose(): void }
    >(),
  executor:
    vi.fn<
      typeof import('../../workflows/video/effect-runtime-sandbox').createEffectRuntimeSandboxExecutor
    >(),
  dispose: vi.fn(),
}));
vi.mock('../../workflows/video-review/render-preview', () => ({
  createReviewPreviewRenderer: io.renderer,
}));
vi.mock('../../workflows/video/effect-runtime-sandbox', () => ({
  createEffectRuntimeSandboxExecutor: io.executor,
}));
vi.mock('./preview-presentation', () => ({
  createReviewPresentationPaintClock: () => ({}),
  createReviewPreviewPresentation: () => ({
    dispose: vi.fn(),
    invalidate: vi.fn(),
    update: vi.fn(),
  }),
}));
it('selects the Gallery GPU annotation sandbox and preserves retry teardown', () => {
  io.renderer.mockReturnValue({ dispose: io.dispose });
  const readAsset = vi.fn();
  const latest = () => ({ input: { video: { current: null }, readAsset }, placement: null });
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
  expect(io.executor).toHaveBeenCalledWith({ compositionBackend: 'gpu-preview' });
  owner.dispose();
  owner.dispose();
  expect(io.dispose).toHaveBeenCalledOnce();
});

it('releases its original source clock on device failure and disposal after the latest source changes', () => {
  io.renderer.mockReturnValue({ dispose: io.dispose });
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
