import * as runtimeAnimation from '../../../../../contracts/effect-runtime/animation';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEffectControlValues } from '@sniptale/runtime-contracts/effect-controls';
import { resolveAnimationObjectRenderBounds } from '@sniptale/runtime-contracts/animation-template';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  parseRuntimeAnimationDocument,
  parseRuntimeAnimationFrame,
} from '../../../../../contracts/effect-runtime/animation';
import { createEffectRuntimeFailure } from '../../../../../contracts/effect-runtime/identity';
import type {
  EffectRuntimeRenderCommand,
  EffectRuntimeSceneResult,
} from '../../../../../contracts/effect-runtime/types';
import { createEffectRuntimeGpuFrameReuse } from './gpu-frame-reuse';
import { createEffectRuntimeGpuFrameLedger } from './resource-limits';
import type { EffectRuntimeFramePlan } from './types';

class Bitmap implements ImageBitmap {
  private closed = false;
  close = vi.fn(() => {
    this.closed = true;
  });
  constructor(
    private readonly w = 8,
    private readonly h = 8
  ) {}
  get width() {
    return this.closed ? 0 : this.w;
  }
  get height() {
    return this.closed ? 0 : this.h;
  }
}
const template = {
  format: 'sniptale-animation',
  version: 1,
  id: 'frame-reuse',
  label: { en: 'Reuse' },
  controls: [],
  bindings: [],
  resources: [],
  animation: { v: '5.12.2', w: 8, h: 8, fr: 30, ip: 0, op: 60, assets: [], layers: [] },
};
const source = JSON.stringify(template);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function plan(time = 0, id = 'effect'): EffectRuntimeFramePlan {
  return {
    effectInstanceId: id,
    snapshotId: 'snapshot',
    documentSha256: digest(source),
    documentSource: source,
    assets: [],
    controls: {},
    dimensions: { width: 8, height: 8 },
    renderDimensions: { width: 8, height: 8 },
    duration: 2,
    fps: 60,
    frameIndex: Math.floor(time * 60),
    progress: time / 2,
    time,
    kind: 'standalone',
    target: { kind: 'scene', clipId: id },
  };
}
function reply(request: EffectRuntimeRenderCommand, bitmap: Bitmap): EffectRuntimeSceneResult {
  return {
    kind: 'frame',
    requestId: request.requestId,
    sequenceId: request.sequenceId,
    effectInstanceId: request.effectInstanceId,
    snapshotId: request.snapshotId,
    width: bitmap.width,
    height: bitmap.height,
    bitmap,
    acknowledged: {
      documentId: request.documentRef.id,
      assetSelectionId: request.assetSelectionRef.id,
    },
  };
}
const owners: ReturnType<typeof createEffectRuntimeGpuFrameReuse>[] = [];
beforeEach(() => vi.stubGlobal('ImageBitmap', Bitmap));
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.unstubAllGlobals();
});
function fixture(enabled = true) {
  const owner = createEffectRuntimeGpuFrameReuse();
  owners.push(owner);
  const ledger = createEffectRuntimeGpuFrameLedger(undefined, 2);
  const bitmaps: Bitmap[] = [];
  let context: object | undefined = enabled ? {} : undefined;
  let disposed = false;
  const executor = {
    get gpuFrameReuseContext() {
      return context;
    },
    maximumConcurrentPreparationRequests: 2 as const,
    renderFrame: vi.fn(),
    prepareGpuFrame: vi.fn(
      async (request: EffectRuntimeRenderCommand): Promise<EffectRuntimeSceneResult> => {
        if (disposed) return createEffectRuntimeFailure(request, 'crashed');
        const payload = await request.materializeImmutablePayloads();
        const document = parseRuntimeAnimationDocument(JSON.parse(payload.documentSource));
        if (!document || !parseRuntimeAnimationFrame({ ...request }, document))
          return createEffectRuntimeFailure(request, 'inputRejected');
        const bitmap = new Bitmap(request.renderWidth, request.renderHeight);
        bitmaps.push(bitmap);
        return reply(request, bitmap);
      }
    ),
    dispose() {
      disposed = true;
      context = undefined;
    },
  };
  const prepare = (p = plan(), signal?: AbortSignal) =>
    owner.prepare({ executor, ledger, plans: [p], ...(signal ? { signal } : {}) });
  return {
    owner,
    ledger,
    executor,
    bitmaps,
    prepare,
    rotate() {
      context = {};
    },
  };
}
function frame(map: Awaited<ReturnType<ReturnType<typeof fixture>['prepare']>>) {
  const result = map.values().next().value;
  if (!result) throw new Error('Expected prepared frame.');
  return result;
}
it('reuses a complete source frame across project ticks and returns current placement metadata', async () => {
  const f = fixture();
  const first = frame(await f.prepare(plan(0)));
  const next = {
    ...plan(0.01),
    snapshotId: 'updated',
    target: { kind: 'scene' as const, clipId: 'other' },
  };
  const second = frame(await f.prepare(next));
  expect(f.executor.prepareGpuFrame).toHaveBeenCalledTimes(1);
  expect(second.source).toBe(first.source);
  expect(second.target).toEqual(next.target);
  expect(second.snapshotId).toBe('updated');
  expect(second.rasterCache).toEqual(first.rasterCache);
  expect(second.rasterCache).toBeDefined();
  first.dispose();
  second.dispose();
  expect(f.bitmaps[0]!.close).not.toHaveBeenCalled();
  f.owner.dispose();
  expect(f.bitmaps[0]!.close).toHaveBeenCalledTimes(1);
  expect(f.ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});
it('keeps replaced contents alive until the last GPU lease returns', async () => {
  const f = fixture();
  const first = frame(await f.prepare());
  const lease = first.retain();
  first.dispose();
  const second = frame(await f.prepare(plan(0.04)));
  expect(f.executor.prepareGpuFrame).toHaveBeenCalledTimes(2);
  expect(second.source).not.toBe(first.source);
  expect(f.bitmaps[0]!.close).not.toHaveBeenCalled();
  lease.release();
  lease.release();
  expect(f.bitmaps[0]!.close).toHaveBeenCalledTimes(1);
  second.dispose();
  f.owner.dispose();
  expect(f.ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});
it('invalidates the physical raster and verified source without mutating outstanding views', async () => {
  const f = fixture();
  const first = frame(await f.prepare());
  const resized = frame(
    await f.prepare({ ...plan(0.01), renderDimensions: { width: 16, height: 8 } })
  );
  const changedSource = JSON.stringify({ ...template, id: 'replacement' });
  const changed = frame(
    await f.prepare({
      ...plan(0.02),
      documentSource: changedSource,
      documentSha256: digest(changedSource),
    })
  );
  expect(f.executor.prepareGpuFrame).toHaveBeenCalledTimes(3);
  expect(resized.width).toBe(16);
  expect(first.width).toBe(8);
  first.dispose();
  resized.dispose();
  changed.dispose();
  f.owner.dispose();
  expect(f.bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
});
it('does not bypass source integrity or complete frame/control validation on a would-be hit', async () => {
  const f = fixture();
  const first = frame(await f.prepare());
  await expect(f.prepare({ ...plan(0.01), controls: { foreign: 1 } })).rejects.toThrow();
  await expect(f.prepare({ ...plan(0.01), progress: 0.5 })).rejects.toThrow();
  const poisoned = JSON.stringify({ ...template, animation: { ...template.animation, fr: 60 } });
  await expect(f.prepare({ ...plan(0.01), documentSource: poisoned })).rejects.toThrow();
  expect(f.bitmaps).toHaveLength(1);
  first.dispose();
});
it('retires successful contents when the owned runtime context changes or is disposed', async () => {
  const f = fixture();
  const first = frame(await f.prepare());
  f.rotate();
  const second = frame(await f.prepare(plan(0.01)));
  expect(second.source).not.toBe(first.source);
  first.dispose();
  f.executor.dispose();
  await expect(f.prepare(plan(0.02))).rejects.toThrow();
  second.dispose();
  f.owner.dispose();
  expect(f.ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});
it('preserves uncached ownership for executors without an explicit reuse context', async () => {
  const f = fixture(false);
  const first = frame(await f.prepare());
  first.dispose();
  expect(f.bitmaps[0]!.close).toHaveBeenCalledTimes(1);
  const second = frame(await f.prepare(plan(0.01)));
  second.dispose();
  expect(f.executor.prepareGpuFrame).toHaveBeenCalledTimes(2);
  expect(second.rasterCache).toBeUndefined();
  expect(f.ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});
it('refuses an aborted cache hit while preserving valid completed contents', async () => {
  const f = fixture();
  const first = frame(await f.prepare());
  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  await expect(f.prepare(plan(0.01), controller.signal)).rejects.toThrow('cancelled');
  const next = frame(await f.prepare(plan(0.02)));
  expect(f.executor.prepareGpuFrame).toHaveBeenCalledTimes(1);
  first.dispose();
  next.dispose();
});
it.each([true, false])(
  'closes a delayed result after owner disposal (reuse %s)',
  async (enabled) => {
    const f = fixture(enabled);
    let complete: ((result: EffectRuntimeSceneResult) => void) | undefined;
    let started: ((request: EffectRuntimeRenderCommand) => void) | undefined;
    const gate = new Promise<EffectRuntimeRenderCommand>((resolve) => {
      started = resolve;
    });
    f.executor.prepareGpuFrame.mockImplementationOnce((request) => {
      started!(request);
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    const pending = f.prepare();
    const request = await gate;
    f.owner.dispose();
    const bitmap = new Bitmap();
    complete!(reply(request, bitmap));
    await expect(pending).rejects.toThrow();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(f.ledger.snapshot().liveDecodedRasterBytes).toBe(0);
  }
);

it('closes fresh contents after the runtime generation retires during preparation', async () => {
  const f = fixture();
  f.executor.prepareGpuFrame.mockImplementationOnce(async (request) => {
    f.rotate();
    const bitmap = new Bitmap();
    f.bitmaps.push(bitmap);
    return reply(request, bitmap);
  });
  await expect(f.prepare()).rejects.toThrow('CONTEXT_RETIRED');
  expect(f.bitmaps[0]!.close).toHaveBeenCalledTimes(1);
  expect(f.ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});

it('rejects a late result from a different previous executor without retiring the current contents', async () => {
  const first = fixture();
  const second = fixture();
  let complete: ((result: EffectRuntimeSceneResult) => void) | undefined;
  let started: ((request: EffectRuntimeRenderCommand) => void) | undefined;
  const gate = new Promise<EffectRuntimeRenderCommand>((resolve) => {
    started = resolve;
  });
  first.executor.prepareGpuFrame.mockImplementationOnce((request) => {
    started!(request);
    return new Promise((resolve) => {
      complete = resolve;
    });
  });
  const old = first.prepare();
  const command = await gate;
  const current = frame(
    await first.owner.prepare({ executor: second.executor, ledger: first.ledger, plans: [plan()] })
  );
  const bitmap = new Bitmap();
  complete!(reply(command, bitmap));
  await expect(old).rejects.toThrow('CONTEXT_RETIRED');
  expect(bitmap.close).toHaveBeenCalledTimes(1);
  expect(second.bitmaps[0]!.width).toBe(8);
  current.dispose();
  first.owner.dispose();
  expect(first.ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});

it('evicts completed contents at the byte budget without closing outstanding GPU readers', async () => {
  const f = fixture();
  const plans = Array.from({ length: 4 }, (_, index) => ({
    ...plan(0, `large-${index}`),
    renderDimensions: { width: 3840, height: 2160 },
  }));
  const batch = await f.owner.prepare({ executor: f.executor, ledger: f.ledger, plans });
  const leases = [...batch.values()].map((item) => {
    const lease = item.retain();
    item.dispose();
    return lease;
  });
  const next = frame(await f.prepare({ ...plans[0]!, effectInstanceId: 'overflow' }));
  expect(f.bitmaps).toHaveLength(5);
  expect(f.bitmaps[0]!.close).not.toHaveBeenCalled();
  leases[0]!.release();
  expect(f.bitmaps[0]!.close).toHaveBeenCalledTimes(1);
  next.dispose();
  f.owner.dispose();
  for (const lease of leases) lease.release();
  expect(f.bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
  expect(f.ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});

it('bounds retained entries while preserving live views from an evicted entry', async () => {
  const f = fixture();
  const plans = Array.from({ length: 64 }, (_, index) => plan(0, `small-${index}`));
  const batch = await f.owner.prepare({ executor: f.executor, ledger: f.ledger, plans });
  const extra = frame(await f.prepare(plan(0, 'overflow')));
  expect(f.bitmaps[0]!.close).not.toHaveBeenCalled();
  batch.get('small-0')!.dispose();
  expect(f.bitmaps[0]!.close).toHaveBeenCalledTimes(1);
  for (const item of batch.values()) item.dispose();
  extra.dispose();
  f.owner.dispose();
  expect(f.bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
  expect(f.ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});

it('does not share cancellation between simultaneous requests for the same canonical frame', async () => {
  const f = fixture();
  const commands: EffectRuntimeRenderCommand[] = [];
  const completions: Array<(value: EffectRuntimeSceneResult) => void> = [];
  let bothStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    bothStarted = resolve;
  });
  f.executor.prepareGpuFrame.mockImplementation((request) => {
    commands.push(request);
    if (commands.length === 2) bothStarted!();
    return new Promise((resolve) => {
      completions.push(resolve);
    });
  });
  const controller = new AbortController();
  const cancelled = f.prepare(plan(), controller.signal);
  const rejected = expect(cancelled).rejects.toThrow();
  const successful = f.prepare(plan(0.01));
  await started;
  controller.abort();
  const survivingBitmap = new Bitmap();
  completions[1]!(reply(commands[1]!, survivingBitmap));
  const surviving = frame(await successful);
  const lateBitmap = new Bitmap();
  completions[0]!(reply(commands[0]!, lateBitmap));
  await rejected;
  expect(lateBitmap.close).toHaveBeenCalledTimes(1);
  expect(survivingBitmap.close).not.toHaveBeenCalled();
  const hit = frame(await f.prepare(plan(0.02)));
  expect(hit.source).toBe(surviving.source);
  expect(f.executor.prepareGpuFrame).toHaveBeenCalledTimes(2);
  surviving.dispose();
  hit.dispose();
  f.owner.dispose();
  expect(survivingBitmap.close).toHaveBeenCalledTimes(1);
  expect(f.ledger.snapshot().liveDecodedRasterBytes).toBe(0);
});

it('keeps identical Lottie hold pixels while rendering the authored entrance and exit', async () => {
  const f = fixture();
  const animationSource = readFileSync(
    'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json',
    'utf8'
  );
  const document = parseRuntimeAnimationDocument(JSON.parse(animationSource));
  if (!document) throw new Error('Invalid animation fixture.');
  const controls = parseEffectControlValues(
    document,
    Object.fromEntries(document.controls.map((control) => [control.id, control.defaultValue]))
  );
  if (!controls) throw new Error('Invalid control fixture.');
  const bounds = resolveAnimationObjectRenderBounds(document, controls);
  const input = (time: number): EffectRuntimeFramePlan => ({
    ...plan(time),
    documentSource: animationSource,
    documentSha256: digest(animationSource),
    controls,
    dimensions: { width: bounds.width, height: bounds.height },
    renderDimensions: { width: Math.ceil(bounds.width), height: Math.ceil(bounds.height) },
    duration: 3,
    progress: time / 3,
  });
  const views: ReturnType<typeof frame>[] = [];
  try {
    const first = frame(await f.prepare(input(0.3)));
    views.push(first);
    const held = frame(await f.prepare(input(0.6)));
    views.push(held);
    expect(held.source).toBe(first.source);
    expect(f.executor.prepareGpuFrame).toHaveBeenCalledTimes(1);
    const edited = frame(
      await f.prepare({ ...input(0.7), controls: { ...controls, opacity: 50 } })
    );
    views.push(edited);
    expect(edited.source).not.toBe(first.source);
    const undone = frame(await f.prepare(input(0.8)));
    views.push(undone);
    expect(undone.source).not.toBe(edited.source);
    const retained = frame(await f.prepare(input(1.2)));
    views.push(retained);
    expect(retained.source).toBe(undone.source);
    const exit = frame(await f.prepare(input(2.8)));
    views.push(exit);
    expect(exit.source).not.toBe(first.source);
    const entrance = frame(await f.prepare(input(0.05)));
    views.push(entrance);
    expect(entrance.source).not.toBe(first.source);
    expect(f.executor.prepareGpuFrame).toHaveBeenCalledTimes(5);
  } finally {
    for (const view of views) view.dispose();
    f.owner.dispose();
  }
  expect(f.ledger.snapshot().liveDecodedRasterBytes).toBe(0);
  expect(f.bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
});

it('retains one admitted immutable document per cached source and re-admits changed sources or context', async () => {
  const read = vi.spyOn(runtimeAnimation, 'verifyRuntimeAnimationSource');
  const f = fixture();
  const sourcesRead = () => read.mock.calls.map(([value]) => value);
  try {
    const first = frame(await f.prepare());
    first.dispose();
    // Initial admission verifies metadata and payload. Hits verify neither; payload transfer remains guarded.
    expect(sourcesRead()).toEqual([source, source]);
    const moved = frame(await f.prepare(plan(0.01)));
    moved.dispose();
    expect(sourcesRead()).toEqual([source, source]);
    const changed = JSON.stringify({ ...template, id: 'changed-source' });
    const replacement = { ...plan(), documentSource: changed, documentSha256: digest(changed) };
    frame(await f.prepare(replacement)).dispose();
    expect(sourcesRead()).toEqual([source, source, changed, changed]);
    f.rotate();
    frame(await f.prepare(replacement)).dispose();
    expect(sourcesRead()).toEqual([source, source, changed, changed, changed, changed]);
  } finally {
    f.owner.dispose();
    read.mockRestore();
  }
});
