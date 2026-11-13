// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type {
  EffectRuntimeFrameResult,
  EffectRuntimeRenderCommand,
  EffectRuntimeSceneResult,
} from '../../contracts/effect-runtime/types';
import { createEffectRuntimeFailure } from '../../contracts/effect-runtime/identity';
import { createEffectRuntimeSandboxExecutor } from './effect-runtime-sandbox';
import { createSandboxRenderRequest, FakeImageBitmap } from './effect-runtime-sandbox.test-support';

type Manager = {
  dispose: ReturnType<typeof vi.fn<() => void>>;
  preload: ReturnType<typeof vi.fn<() => void>>;
  prepareGpuFrame: ReturnType<
    typeof vi.fn<(request: EffectRuntimeRenderCommand) => Promise<EffectRuntimeSceneResult>>
  >;
  renderFrame: ReturnType<
    typeof vi.fn<(request: EffectRuntimeRenderCommand) => Promise<EffectRuntimeFrameResult>>
  >;
};
const io = vi.hoisted(() => ({ managers: [] as Manager[] }));
vi.mock('./effect-runtime-sandbox-session', () => ({
  EFFECT_RUNTIME_SANDBOX_PAGE_PATH: 'sandbox',
  EffectRuntimeSandboxSessionManager: class {
    constructor() {
      const manager: Manager = {
        dispose: vi.fn(),
        preload: vi.fn(),
        prepareGpuFrame: vi.fn(async (request) => frame(request)),
        renderFrame: vi.fn(async (request) => frame(request)),
      };
      io.managers.push(manager);
      return manager;
    }
  },
}));
function frame(request: EffectRuntimeRenderCommand): EffectRuntimeFrameResult {
  return {
    kind: 'frame',
    bitmap: new FakeImageBitmap(request.renderWidth, request.renderHeight),
    width: request.renderWidth,
    height: request.renderHeight,
    effectInstanceId: request.effectInstanceId,
    requestId: request.requestId,
    sequenceId: request.sequenceId,
    snapshotId: request.snapshotId,
    acknowledged: {
      documentId: request.documentRef.id,
      assetSelectionId: request.assetSelectionRef.id,
    },
  };
}
function deferred() {
  let resolve!: (value: EffectRuntimeSceneResult) => void;
  const promise = new Promise<EffectRuntimeSceneResult>((accept) => (resolve = accept));
  return { promise, resolve };
}
beforeEach(() => io.managers.splice(0));

it('adopts only completed standby work and retains its model through the first foreground request', async () => {
  const primary = createEffectRuntimeSandboxExecutor({ compositionBackend: 'gpu-scene' });
  const warm = primary.createWarmExecutor!()!;
  const request = createSandboxRenderRequest();
  await warm.prepareGpuFrame!(request);
  warm.dispose();
  expect(io.managers[1]!.dispose).not.toHaveBeenCalled();
  await primary.prepareGpuFrame!({ ...request, requestId: 'foreground', time: 0.5 });
  expect(io.managers).toHaveLength(2);
  expect(io.managers[0]!.dispose).toHaveBeenCalledOnce();
  expect(io.managers[0]!.prepareGpuFrame).not.toHaveBeenCalled();
  expect(io.managers[1]!.prepareGpuFrame).toHaveBeenCalledTimes(2);
  warm.dispose();
  expect(io.managers[1]!.dispose).not.toHaveBeenCalled();
  primary.dispose();
  expect(io.managers[1]!.dispose).toHaveBeenCalledOnce();
});

it('does not wait for pending advisory work when a foreground request arrives', async () => {
  const primary = createEffectRuntimeSandboxExecutor({ compositionBackend: 'gpu-scene' });
  const warm = primary.createWarmExecutor!()!;
  const request = createSandboxRenderRequest(),
    pending = deferred();
  io.managers[1]!.prepareGpuFrame.mockReturnValueOnce(pending.promise);
  const warming = warm.prepareGpuFrame!(request);
  await expect(
    primary.prepareGpuFrame!({ ...request, requestId: 'priority' })
  ).resolves.toMatchObject({ kind: 'frame' });
  expect(io.managers[1]!.dispose).toHaveBeenCalledOnce();
  expect(io.managers[0]!.prepareGpuFrame).toHaveBeenCalledOnce();
  pending.resolve(createEffectRuntimeFailure(request, 'crashed'));
  await warming;
  warm.dispose();
  primary.dispose();
  expect(io.managers[1]!.dispose).toHaveBeenCalledOnce();
});

it('keeps failed standby work out of the foreground session and failure budget', async () => {
  const primary = createEffectRuntimeSandboxExecutor({ compositionBackend: 'gpu-scene-plan' });
  const warm = primary.createWarmExecutor!()!;
  const request = createSandboxRenderRequest();
  io.managers[1]!.prepareGpuFrame.mockResolvedValueOnce(
    createEffectRuntimeFailure(request, 'resourceLimit')
  );
  await expect(warm.prepareGpuFrame!(request)).resolves.toMatchObject({ kind: 'error' });
  warm.dispose();
  await expect(primary.prepareGpuFrame!(request)).resolves.toMatchObject({ kind: 'frame' });
  expect(io.managers[0]!.dispose).not.toHaveBeenCalled();
  expect(io.managers[1]!.dispose).toHaveBeenCalledOnce();
  primary.dispose();
});

it('retains admission for two foreground requests after one atomic handoff', async () => {
  const primary = createEffectRuntimeSandboxExecutor({ compositionBackend: 'gpu-scene' });
  const warm = primary.createWarmExecutor!()!;
  const request = createSandboxRenderRequest();
  await warm.prepareGpuFrame!(request);
  warm.dispose();
  const one = deferred(),
    two = deferred();
  io.managers[1]!.prepareGpuFrame.mockReturnValueOnce(one.promise).mockReturnValueOnce(two.promise);
  const first = primary.prepareGpuFrame!({ ...request, requestId: 'one' });
  const second = primary.prepareGpuFrame!({ ...request, requestId: 'two' });
  expect(io.managers[1]!.prepareGpuFrame).toHaveBeenCalledTimes(3);
  expect(io.managers[0]!.dispose).toHaveBeenCalledOnce();
  one.resolve(frame(request));
  two.resolve(frame(request));
  await Promise.all([first, second]);
  expect(primary.createWarmExecutor!()).toBeUndefined();
  primary.dispose();
});

it('does not replace an executor after it has served foreground work', async () => {
  const primary = createEffectRuntimeSandboxExecutor({ compositionBackend: 'gpu-scene' });
  await primary.prepareGpuFrame!(createSandboxRenderRequest());
  expect(primary.createWarmExecutor!()).toBeUndefined();
  expect(io.managers).toHaveLength(1);
  primary.dispose();
});

it('retires a pending child once on disposal and cannot recreate it afterward', async () => {
  const primary = createEffectRuntimeSandboxExecutor({ compositionBackend: 'gpu-scene' });
  const warm = primary.createWarmExecutor!()!;
  const request = createSandboxRenderRequest(),
    pending = deferred();
  io.managers[1]!.prepareGpuFrame.mockReturnValueOnce(pending.promise);
  const warming = warm.prepareGpuFrame!(request);
  primary.dispose();
  warm.dispose();
  primary.dispose();
  pending.resolve(createEffectRuntimeFailure(request, 'crashed'));
  await warming;
  expect(io.managers[0]!.dispose).toHaveBeenCalledOnce();
  expect(io.managers[1]!.dispose).toHaveBeenCalledOnce();
  expect(primary.createWarmExecutor!()).toBeUndefined();
  primary.preload!();
  expect(io.managers).toHaveLength(2);
});

it.each([undefined, 'gpu-preview'] as const)(
  'does not expose standby acquisition for %s',
  (compositionBackend) => {
    const primary = createEffectRuntimeSandboxExecutor(
      compositionBackend ? { compositionBackend } : {}
    );
    expect(primary.createWarmExecutor).toBeUndefined();
    primary.dispose();
  }
);

it('rejects late advisory commands after foreground adoption without retiring its session', async () => {
  const primary = createEffectRuntimeSandboxExecutor({ compositionBackend: 'gpu-scene' });
  const warm = primary.createWarmExecutor!()!,
    request = createSandboxRenderRequest();
  expect(warm.maximumWarmFrames).toBe(4);
  await warm.prepareGpuFrame!(request);
  await primary.prepareGpuFrame!({ ...request, requestId: 'foreground' });
  await expect(warm.prepareGpuFrame!(request)).resolves.toMatchObject({
    kind: 'error',
    code: 'stale',
  });
  expect(io.managers[1]!.prepareGpuFrame).toHaveBeenCalledTimes(2);
  warm.dispose();
  expect(io.managers[1]!.dispose).not.toHaveBeenCalled();
  primary.dispose();
  expect(io.managers[1]!.dispose).toHaveBeenCalledOnce();
});
