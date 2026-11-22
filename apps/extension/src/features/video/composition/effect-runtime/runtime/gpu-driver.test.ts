import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEffectRuntimeFailure } from '../../../../../contracts/effect-runtime/identity';
import type {
  EffectRuntimeErrorCode,
  EffectRuntimeRenderCommand,
  EffectRuntimeSceneResult,
} from '../../../../../contracts/effect-runtime/types';
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
const source = JSON.stringify({
  format: 'sniptale-animation',
  version: 1,
  id: 'gpu-lifecycle',
  label: { en: 'GPU lifecycle' },
  controls: [],
  bindings: [],
  resources: [],
  animation: { v: '5.12.2', w: 8, h: 8, fr: 30, ip: 0, op: 30, assets: [], layers: [] },
});
const sha256 = createHash('sha256').update(source).digest('hex');
function plan(id = 'effect'): EffectRuntimeFramePlan {
  return {
    effectInstanceId: id,
    snapshotId: 'effect:' + sha256,
    documentSha256: sha256,
    documentSource: source,
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

function controlledPreparations(capacity?: 2) {
  const requests: {
    command: EffectRuntimeRenderCommand;
    response: ReturnType<typeof Promise.withResolvers<EffectRuntimeSceneResult>>;
    bitmap: Bitmap;
  }[] = [];
  const owner: EffectRuntimeSandboxExecutor = {
    ...(capacity ? { maximumConcurrentPreparationRequests: capacity } : {}),
    dispose: vi.fn(),
    renderFrame: vi.fn(),
    prepareGpuFrame: vi.fn((command) => {
      const response = Promise.withResolvers<EffectRuntimeSceneResult>();
      requests.push({ command, response, bitmap: new Bitmap() });
      return response.promise;
    }),
  };
  const complete = async (
    sequenceId: number,
    failure?: Exclude<EffectRuntimeErrorCode, 'cacheMiss'>
  ) => {
    const entry = requests.find((r) => r.command.sequenceId === sequenceId);
    if (!entry) throw new Error('Missing controlled request');
    if (failure) {
      entry.bitmap.close();
      entry.response.resolve(createEffectRuntimeFailure(entry.command, failure));
    } else entry.response.resolve(await executor(entry.bitmap).prepareGpuFrame!(entry.command));
  };
  return { owner, requests, complete };
}

it('overlaps two supported annotation preparations and preserves authored order', async () => {
  const f = controlledPreparations(2);
  const ledger = createEffectRuntimeGpuFrameLedger();
  const pending = prepareEffectRuntimeGpuFramePlans({
    executor: f.owner,
    plans: Array.from({ length: 4 }, (_, i) => plan('pair-' + i)),
    ledger,
  });
  await vi.waitFor(() => expect(f.requests).toHaveLength(2));
  await f.complete(1);
  await vi.waitFor(() => expect(f.requests).toHaveLength(3));
  expect(f.requests[2]!.command.sequenceId).toBe(2);
  await f.complete(0);
  await vi.waitFor(() => expect(f.requests).toHaveLength(4));
  await f.complete(3);
  await f.complete(2);
  const frames = await pending;
  expect([...frames.keys()]).toEqual(['pair-0', 'pair-1', 'pair-2', 'pair-3']);
  expect(f.requests.map((r) => r.command.sequenceId).sort()).toEqual([0, 1, 2, 3]);
  for (const frame of frames.values()) frame.dispose();
  for (const request of f.requests) expect(request.bitmap.close).toHaveBeenCalledOnce();
  expect(ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});

it.each(['failure', 'abort', 'reject'] as const)(
  'drains both submitted results after %s without starting the next annotation',
  async (outcome) => {
    const f = controlledPreparations(2);
    const ledger = createEffectRuntimeGpuFrameLedger();
    const controller = new AbortController();
    let settled = false;
    const pending = prepareEffectRuntimeGpuFramePlans({
      executor: f.owner,
      plans: [plan('first'), plan('second'), plan('third')],
      ledger,
      signal: controller.signal,
    });
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await vi.waitFor(() => expect(f.requests).toHaveLength(2));
    if (outcome === 'abort') controller.abort();
    if (outcome === 'reject') {
      const first = f.requests.find((r) => r.command.sequenceId === 0)!;
      first.bitmap.close();
      first.response.reject(new Error('Controlled transport rejection'));
    } else await f.complete(0, outcome === 'failure' ? 'inputRejected' : undefined);
    expect(settled).toBe(false);
    expect(f.requests).toHaveLength(2);
    await f.complete(1);
    await expect(pending).rejects.toThrow();
    expect(f.requests).toHaveLength(2);
    for (const request of f.requests) expect(request.bitmap.close).toHaveBeenCalledOnce();
    expect(ledger.snapshot().liveDecodedRasterBytes).toBe(0);
  }
);

it('keeps unknown executors serial until the first annotation response', async () => {
  const f = controlledPreparations();
  const ledger = createEffectRuntimeGpuFrameLedger();
  const pending = prepareEffectRuntimeGpuFramePlans({
    executor: f.owner,
    plans: [plan('one'), plan('two')],
    ledger,
  });
  await vi.waitFor(() => expect(f.requests).toHaveLength(1));
  await f.complete(0);
  await vi.waitFor(() => expect(f.requests).toHaveLength(2));
  await f.complete(1);
  for (const frame of (await pending).values()) frame.dispose();
  expect(ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});

it('drains paired over-budget replies without retaining any partial raster', async () => {
  const bitmaps: Bitmap[] = [];
  const owner = { ...executor(new Bitmap()), maximumConcurrentPreparationRequests: 2 as const };
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
      plans: Array.from({ length: 18 }, (_, index) => ({
        ...plan('paired-mask-' + index),
        renderDimensions: { width: 1904, height: 1072 },
      })),
    })
  ).rejects.toThrow();
  expect(bitmaps).toHaveLength(18);
  for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
  expect(ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});

it('retains the first GPU preparation failure when a concurrent frame returns circuitOpen', async () => {
  const f = controlledPreparations(2);
  const pending = prepareEffectRuntimeGpuFramePlans({
    executor: f.owner,
    plans: [plan('first'), plan('second')],
    ledger: createEffectRuntimeGpuFrameLedger(),
  });
  const rejection = expect(pending).rejects.toMatchObject({ code: 'timeout' });
  await vi.waitFor(() => expect(f.requests).toHaveLength(2));
  await f.complete(1, 'circuitOpen');
  await f.complete(0, 'timeout');
  await rejection;
});
