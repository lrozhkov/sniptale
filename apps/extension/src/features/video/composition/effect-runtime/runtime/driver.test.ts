import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { EffectRuntimeSandboxExecutor } from '../../../../../contracts/effect-runtime/types';
import { createEffectRuntimeCompositionResourceLedger } from './resource-limits';
import { renderEffectRuntimeFramePlans } from './driver';
import type { EffectRuntimeFramePlan } from './types';
const source = readFileSync(
  'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json',
  'utf8'
);
const hash = createHash('sha256').update(source).digest('hex');
class FakeBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width = 10,
    readonly height = 10
  ) {}
}
function plan(id: string): EffectRuntimeFramePlan {
  return {
    assets: [],
    controls: {},
    dimensions: { width: 10, height: 10 },
    renderDimensions: { width: 10, height: 10 },
    documentSha256: hash,
    documentSource: source,
    duration: 2,
    effectInstanceId: id,
    fps: 30,
    frameIndex: 0,
    kind: 'standalone',
    progress: 0,
    snapshotId: hash,
    target: { kind: 'scene', clipId: id },
    time: 0,
  };
}
function fixture(onFrame?: (index: number) => void, failAt?: number) {
  const outputs: FakeBitmap[] = [];
  const requests: string[] = [];
  const inputMaterializer = {
    materializeTargetSource: vi.fn(),
    materializeTransitionInputs: vi.fn(),
  };
  const executor: EffectRuntimeSandboxExecutor = {
    dispose: vi.fn(),
    renderFrame: vi.fn(async (request) => {
      requests.push(request.effectInstanceId);
      onFrame?.(requests.length);
      if (requests.length === failAt)
        return {
          kind: 'error' as const,
          code: 'timeout' as const,
          effectInstanceId: request.effectInstanceId,
          requestId: request.requestId,
          sequenceId: request.sequenceId,
          snapshotId: request.snapshotId,
        };
      expect(request.inputFrames).toEqual({});
      await expect(request.materializeImmutablePayloads()).resolves.toEqual({
        assets: [],
        documentSource: source,
      });
      const bitmap = new FakeBitmap();
      outputs.push(bitmap);
      return {
        kind: 'frame' as const,
        bitmap,
        width: 10,
        height: 10,
        effectInstanceId: request.effectInstanceId,
        requestId: request.requestId,
        sequenceId: request.sequenceId,
        snapshotId: request.snapshotId,
        acknowledged: {
          documentId: request.documentRef.id,
          assetSelectionId: request.assetSelectionRef.id,
        },
      };
    }),
  };
  return { executor, inputMaterializer, requests, outputs };
}
it('keeps independent Lottie outputs in source order without materializing video inputs', async () => {
  const f = fixture();
  const frames = await renderEffectRuntimeFramePlans({ ...f, plans: [plan('a'), plan('b')] });
  expect(f.requests).toEqual(['a', 'b']);
  expect([...frames.keys()]).toEqual(['a', 'b']);
  expect(frames.get('a')?.bitmap).toBe(f.outputs[0]);
  expect(frames.get('b')?.bitmap).toBe(f.outputs[1]);
  f.outputs.forEach((bitmap) => expect(bitmap.close).not.toHaveBeenCalled());
  expect(f.inputMaterializer.materializeTargetSource).not.toHaveBeenCalled();
  expect(f.inputMaterializer.materializeTransitionInputs).not.toHaveBeenCalled();
});
it('keeps a typed sandbox failure explicit and disposes completed output authorities', async () => {
  const f = fixture(undefined, 2);
  await expect(
    renderEffectRuntimeFramePlans({ ...f, plans: [plan('a'), plan('b')] })
  ).rejects.toMatchObject({ name: 'EffectRuntimeFrameError', code: 'timeout' });
  expect(f.outputs).toHaveLength(1);
  expect(f.outputs[0]!.close).toHaveBeenCalledOnce();
});
it.each([1, 2, 3])('cancels after output %i and releases all completed frames', async (stopAt) => {
  const controller = new AbortController();
  const f = fixture((index) => {
    if (index === stopAt) controller.abort();
  });
  await expect(
    renderEffectRuntimeFramePlans({
      ...f,
      plans: ['a', 'b', 'c'].map(plan),
      signal: controller.signal,
    })
  ).rejects.toThrow();
  expect(f.requests).toHaveLength(stopAt);
  expect(f.outputs).toHaveLength(stopAt);
  f.outputs.forEach((bitmap) => expect(bitmap.close).toHaveBeenCalledOnce());
});
it('does not dispatch an already cancelled request', async () => {
  const f = fixture();
  await expect(
    renderEffectRuntimeFramePlans({ ...f, plans: [plan('a')], signal: AbortSignal.abort() })
  ).rejects.toThrow();
  expect(f.requests).toEqual([]);
});
it.each(['targetEffect', 'transition'])(
  'refuses retired %s plans before execution',
  async (kind) => {
    const f = fixture();
    const invalid = plan('a');
    Reflect.set(invalid, 'kind', kind);
    await expect(renderEffectRuntimeFramePlans({ ...f, plans: [invalid] })).rejects.toThrow(
      'EFFECT_RUNTIME_ANIMATION_INPUT_REJECTED'
    );
    expect(f.requests).toEqual([]);
  }
);
it('releases earlier output when request construction fails', async () => {
  const f = fixture(),
    invalid = plan('b');
  invalid.documentSource = '{}';
  await expect(
    renderEffectRuntimeFramePlans({ ...f, plans: [plan('a'), invalid] })
  ).rejects.toThrow('EFFECT_RUNTIME_REQUEST_BUILD_FAILED');
  expect(f.outputs).toHaveLength(1);
  expect(f.outputs[0]!.close).toHaveBeenCalledOnce();
});

it.each(['clip', 'track', 'video-group', 'transition'] as const)(
  'refuses a valid-prefix batch with non-scene %s before any dispatch',
  async (kind) => {
    const f = fixture();
    const invalid = plan('invalid');
    Reflect.set(invalid, 'target', {
      kind,
      clipId: 'clip',
      trackId: 'track',
      transitionId: 'join',
    });
    await expect(
      renderEffectRuntimeFramePlans({ ...f, plans: [plan('valid'), invalid] })
    ).rejects.toThrow('EFFECT_RUNTIME_ANIMATION_INPUT_REJECTED');
    expect(f.requests).toEqual([]);
    expect(f.inputMaterializer.materializeTargetSource).not.toHaveBeenCalled();
    expect(f.inputMaterializer.materializeTransitionInputs).not.toHaveBeenCalled();
  }
);
it('uses unique request identities and batch-local sequences in source order', async () => {
  const f = fixture();
  await renderEffectRuntimeFramePlans({ ...f, plans: [plan('a'), plan('b')] });
  const requests = vi.mocked(f.executor.renderFrame).mock.calls.map(([request]) => request);
  expect(requests.map((request) => request.sequenceId)).toEqual([0, 1]);
  expect(new Set(requests.map((request) => request.requestId)).size).toBe(2);
});
it('closes rejected output and earlier retained output when output admission refuses', async () => {
  const f = fixture();
  const ledger = createEffectRuntimeCompositionResourceLedger();
  const scope = ledger.createFrameScope();
  const retain = scope.retainBitmap.bind(scope);
  vi.spyOn(scope, 'retainBitmap')
    .mockImplementationOnce(retain)
    .mockImplementationOnce(() => {
      throw new Error('Resource scope refusal');
    });
  await expect(
    renderEffectRuntimeFramePlans({ ...f, resourceScope: scope, plans: [plan('a'), plan('b')] })
  ).rejects.toThrow('EFFECT_RUNTIME_OUTPUT_RESOURCE_LIMIT');
  expect(f.outputs).toHaveLength(2);
  f.outputs.forEach((bitmap) => expect(bitmap.close).toHaveBeenCalledOnce());
  expect(ledger.snapshot()).toEqual({ liveDecodedRasterBytes: 0, liveRasterResources: 0 });
});
it('releases completed output when a later executor rejects', async () => {
  const f = fixture();
  const original = vi.mocked(f.executor.renderFrame).getMockImplementation()!;
  vi.spyOn(f.executor, 'renderFrame')
    .mockImplementationOnce(original)
    .mockRejectedValueOnce(new Error('Executor failed'));
  const ledger = createEffectRuntimeCompositionResourceLedger();
  await expect(
    renderEffectRuntimeFramePlans({
      ...f,
      resourceScope: ledger.createFrameScope(),
      plans: [plan('a'), plan('b')],
    })
  ).rejects.toThrow('Executor failed');
  expect(f.outputs).toHaveLength(1);
  expect(f.outputs[0]!.close).toHaveBeenCalledOnce();
  expect(ledger.snapshot()).toEqual({ liveDecodedRasterBytes: 0, liveRasterResources: 0 });
});
it('captures plan membership before awaiting the first executor', async () => {
  const plans = [plan('a'), plan('b')];
  const f = fixture((index) => {
    if (index === 1) plans.push(plan('late'));
  });
  await renderEffectRuntimeFramePlans({ ...f, plans });
  expect(f.requests).toEqual(['a', 'b']);
});
