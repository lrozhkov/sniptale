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
      width: bitmap.width,
      height: bitmap.height,
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

it.each([1, 2] as const)(
  'accounts for two full-size nine-mask packets through GPU borrows with capacity %s',
  async (maximumInFlight) => {
    const bitmaps: Bitmap[] = [];
    const owner = executor(new Bitmap());
    owner.prepareGpuFrame = async (request) => {
      const bitmap = new Bitmap(1904, 1072);
      bitmaps.push(bitmap);
      return executor(bitmap).prepareGpuFrame!(request);
    };
    const ledger = createEffectRuntimeGpuFrameLedger(undefined, maximumInFlight);
    const plans = Array.from({ length: 9 }, (_, index) => ({
      ...plan(`mask-${index}`),
      renderDimensions: { width: 1904, height: 1072 },
    }));
    const first = await prepareEffectRuntimeGpuFramePlans({ executor: owner, plans, ledger });
    const borrows = [...first.values()].map((frame) => frame.retain());
    for (const frame of first.values()) frame.dispose();
    const cost = 9 * 1904 * 1072 * 4;
    expect(ledger.snapshot().liveDecodedRasterBytes).toBe(cost);
    if (maximumInFlight === 1) {
      await expect(
        prepareEffectRuntimeGpuFramePlans({ executor: owner, plans, ledger })
      ).rejects.toThrow();
      expect(ledger.snapshot().liveDecodedRasterBytes).toBe(cost);
      for (const bitmap of bitmaps.slice(9)) expect(bitmap.close).toHaveBeenCalledOnce();
    } else {
      const second = await prepareEffectRuntimeGpuFramePlans({ executor: owner, plans, ledger });
      expect(ledger.snapshot().liveDecodedRasterBytes).toBe(cost * 2);
      for (const frame of second.values()) frame.dispose();
      expect(ledger.snapshot().liveDecodedRasterBytes).toBe(cost);
    }
    for (const bitmap of bitmaps.slice(0, 9)) expect(bitmap.close).not.toHaveBeenCalled();
    for (const borrow of borrows) borrow.release();
    expect(ledger.snapshot().liveDecodedRasterBytes).toBe(0);
    for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
  }
);

it('rejects an oversized packet in two-frame mode and closes its partial results', async () => {
  const bitmaps: Bitmap[] = [];
  const owner = executor(new Bitmap());
  owner.prepareGpuFrame = async (request) => {
    const bitmap = new Bitmap(1904, 1072);
    bitmaps.push(bitmap);
    return executor(bitmap).prepareGpuFrame!(request);
  };
  const ledger = createEffectRuntimeGpuFrameLedger(undefined, 2);
  await expect(
    prepareEffectRuntimeGpuFramePlans({
      executor: owner,
      ledger,
      plans: Array.from({ length: 17 }, (_, index) => ({
        ...plan(`mask-${index}`),
        renderDimensions: { width: 1904, height: 1072 },
      })),
    })
  ).rejects.toThrow();
  expect(bitmaps).toHaveLength(17);
  for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
  expect(ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});
