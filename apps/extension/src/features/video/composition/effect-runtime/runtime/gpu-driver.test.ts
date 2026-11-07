import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EffectRuntimeSandboxExecutor } from '../../../../../contracts/effect-runtime/types';
import type { EffectRuntimeFramePlan } from './types';
import { createEffectRuntimeGpuFrameLedger } from './resource-limits';
import { prepareEffectRuntimeGpuFramePlans } from './gpu-driver';
class Bitmap implements ImageBitmap {
  close = vi.fn();
  constructor(
    readonly width = 8,
    readonly height = 8
  ) {}
}
beforeEach(() => vi.stubGlobal('ImageBitmap', Bitmap));
afterEach(() => vi.unstubAllGlobals());
function plan(id = 'effect'): EffectRuntimeFramePlan {
  return {
    effectInstanceId: id,
    snapshotId: 'effect:' + 'a'.repeat(64),
    documentSha256: 'a'.repeat(64),
    documentSource: '{}',
    assets: [],
    controls: {},
    dimensions: { width: 8, height: 8 },
    renderDimensions: { width: 8, height: 8 },
    duration: 1,
    fps: 30,
    frameIndex: 0,
    progress: 0,
    time: 0,
    kind: 'standalone',
    target: { kind: 'scene', clipId: id },
  };
}
function executor(bitmap: Bitmap): EffectRuntimeSandboxExecutor {
  return {
    dispose() {},
    renderFrame: vi.fn(),
    prepareGpuFrame: vi.fn(async (request) => ({
      kind: 'frame' as const,
      bitmap,
      width: 8,
      height: 8,
      effectInstanceId: request.effectInstanceId,
      requestId: request.requestId,
      sequenceId: request.sequenceId,
      snapshotId: request.snapshotId,
      acknowledged: {
        documentId: request.documentRef.id,
        assetSelectionId: request.assetSelectionRef.id,
      },
    })),
  };
}
it('retains retired poses through every GPU borrow and closes each raster once', async () => {
  const bitmap = new Bitmap(),
    ledger = createEffectRuntimeGpuFrameLedger();
  const frames = await prepareEffectRuntimeGpuFramePlans({
    executor: executor(bitmap),
    plans: [plan()],
    ledger,
  });
  const frame = frames.get('effect')!,
    a = frame.retain(),
    b = frame.retain();
  frame.dispose();
  frame.dispose();
  expect(bitmap.close).not.toHaveBeenCalled();
  expect(() => frame.retain()).toThrow('RETIRED');
  a.release();
  a.release();
  expect(bitmap.close).not.toHaveBeenCalled();
  b.release();
  b.release();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});
it('closes late results after cancellation without adding them to the scene', async () => {
  const bitmap = new Bitmap(),
    abort = new AbortController(),
    ledger = createEffectRuntimeGpuFrameLedger(),
    owner = executor(bitmap);
  const prepare = owner.prepareGpuFrame!;
  owner.prepareGpuFrame = async (request) => {
    const result = await prepare(request);
    abort.abort();
    return result;
  };
  await expect(
    prepareEffectRuntimeGpuFramePlans({
      executor: owner,
      plans: [plan()],
      ledger,
      signal: abort.signal,
    })
  ).rejects.toThrow();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});
it('releases already prepared frames when another plan fails', async () => {
  const bitmap = new Bitmap(),
    ledger = createEffectRuntimeGpuFrameLedger(),
    owner = executor(bitmap),
    prepare = owner.prepareGpuFrame!;
  owner.prepareGpuFrame = async (request) =>
    request.effectInstanceId === 'effect'
      ? prepare(request)
      : {
          kind: 'error',
          code: 'resourceLimit',
          effectInstanceId: request.effectInstanceId,
          requestId: request.requestId,
          sequenceId: request.sequenceId,
          snapshotId: request.snapshotId,
        };
  await expect(
    prepareEffectRuntimeGpuFramePlans({ executor: owner, plans: [plan(), plan('second')], ledger })
  ).rejects.toThrow();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});
