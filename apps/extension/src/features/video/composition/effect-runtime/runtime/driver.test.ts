import { expect, it, vi } from 'vitest';

import type { EffectRuntimeSandboxExecutor } from '../../../../../contracts/effect-runtime/types';
import { renderEffectRuntimeFramePlans } from './driver';
import type { EffectRuntimeFramePlan } from './types';

class FakeImageBitmap implements ImageBitmap {
  readonly close = vi.fn();

  constructor(
    readonly width: number,
    readonly height: number,
    readonly label: string
  ) {}
}

it('runs a target chain in stable order and retains only its final bitmap authority', async () => {
  const base = bitmap('base', 200, 100);
  const fixture = createOrderedExecutor();

  const frames = await renderEffectRuntimeFramePlans({
    executor: fixture.executor,
    inputMaterializer: {
      materializeTargetSource: vi.fn(async () => base),
      materializeTransitionInputs: vi.fn(),
    },
    plans: createTargetChainPlans(),
  });

  expect(fixture.requests.map(({ instanceId }) => instanceId)).toEqual([
    'standalone',
    'target-1',
    'target-2',
  ]);
  expect(fixture.requests[1]?.input).toBe(base);
  expect(fixture.requests[2]?.input).toBe(fixture.outputs.target1);
  expect(frames.has('target-1')).toBe(false);
  expect(frames.get('target-2')?.bitmap).toBe(fixture.outputs.target2);
  expect(base.close).toHaveBeenCalledOnce();
});

it('prepares a junction only after its clip FX have completed', async () => {
  const fixture = createOrderedExecutor();
  const transition = createPlan(
    'junction',
    {
      kind: 'transition',
      leadingClipId: 'clip-a',
      trailingClipId: 'clip-b',
      transitionId: 'junction',
    },
    200,
    100
  );
  const materializeTransitionInputs = vi.fn(async () => {
    expect(fixture.requests.map(({ instanceId }) => instanceId)).toEqual(['target-1', 'target-2']);
    return { from: bitmap('from', 200, 100), to: bitmap('to', 200, 100) };
  });
  await renderEffectRuntimeFramePlans({
    executor: fixture.executor,
    inputMaterializer: {
      materializeTargetSource: vi.fn(async () => bitmap('base', 200, 100)),
      materializeTransitionInputs,
    },
    plans: [transition, ...createTargetChainPlans().slice(1)],
  });
  expect(materializeTransitionInputs).toHaveBeenCalledOnce();
});

it('disposes earlier successes and surfaces a typed runtime failure without fallback', async () => {
  const success = bitmap('success', 1280, 720);
  let call = 0;
  const executor: EffectRuntimeSandboxExecutor = {
    dispose: vi.fn(),
    renderFrame: vi.fn(async (request) => {
      call += 1;
      return call === 1
        ? {
            acknowledged: {
              assetSelectionId: request.assetSelectionRef.id,
              documentId: request.documentRef.id,
            },
            bitmap: success,
            effectInstanceId: request.effectInstanceId,
            height: 720,
            kind: 'frame' as const,
            requestId: request.requestId,
            sequenceId: request.sequenceId,
            snapshotId: request.snapshotId,
            width: 1280,
          }
        : {
            code: 'timeout' as const,
            effectInstanceId: request.effectInstanceId,
            kind: 'error' as const,
            requestId: request.requestId,
            sequenceId: request.sequenceId,
            snapshotId: request.snapshotId,
          };
    }),
  };

  await expect(
    renderEffectRuntimeFramePlans({
      executor,
      inputMaterializer: {
        materializeTargetSource: vi.fn(),
        materializeTransitionInputs: vi.fn(),
      },
      plans: [
        createPlan('standalone-1', { clipId: 'host-1', kind: 'scene' }, 1280, 720),
        createPlan('standalone-2', { clipId: 'host-2', kind: 'scene' }, 1280, 720),
      ],
    })
  ).rejects.toEqual(
    expect.objectContaining({ failures: [expect.objectContaining({ code: 'timeout' })] })
  );
  expect(success.close).toHaveBeenCalledOnce();
});

it('distinguishes transition input materialization from sandbox execution failures', async () => {
  const transitionPlan = createPlan(
    'transition',
    {
      kind: 'transition',
      leadingClipId: 'leading',
      trailingClipId: 'trailing',
      transitionId: 'transition',
    },
    1280,
    720
  );
  const executor = {
    dispose: vi.fn(),
    renderFrame: vi.fn(async () => {
      throw new Error('sandbox failed');
    }),
  } satisfies EffectRuntimeSandboxExecutor;

  await expect(
    renderEffectRuntimeFramePlans({
      executor,
      inputMaterializer: {
        materializeTargetSource: vi.fn(),
        materializeTransitionInputs: vi.fn(async () => {
          throw new Error('missing input');
        }),
      },
      plans: [transitionPlan],
    })
  ).rejects.toThrow('EFFECT_RUNTIME_INPUT_MATERIALIZATION_FAILED');
  expect(executor.renderFrame).not.toHaveBeenCalled();

  const from = bitmap('from', 1280, 720);
  const to = bitmap('to', 1280, 720);
  await expect(
    renderEffectRuntimeFramePlans({
      executor,
      inputMaterializer: {
        materializeTargetSource: vi.fn(),
        materializeTransitionInputs: vi.fn(async () => ({ from, to })),
      },
      plans: [transitionPlan],
    })
  ).rejects.toThrow('sandbox failed');
  expect(from.close).toHaveBeenCalledOnce();
  expect(to.close).toHaveBeenCalledOnce();
});

function createOrderedExecutor(): {
  executor: EffectRuntimeSandboxExecutor;
  outputs: { standalone: FakeImageBitmap; target1: FakeImageBitmap; target2: FakeImageBitmap };
  requests: Array<{ input?: ImageBitmap; instanceId: string }>;
} {
  const outputs = {
    standalone: bitmap('standalone', 1280, 720),
    target1: bitmap('target-1', 200, 100),
    target2: bitmap('target-2', 200, 100),
  };
  const pending = [outputs.standalone, outputs.target1, outputs.target2];
  const requests: Array<{ input?: ImageBitmap; instanceId: string }> = [];
  return {
    executor: {
      dispose: vi.fn(),
      renderFrame: vi.fn(async (request) => {
        const input = request.inputFrames.source?.bitmap;
        requests.push({ ...(input ? { input } : {}), instanceId: request.effectInstanceId });
        input?.close();
        const output = pending.shift()!;
        return {
          acknowledged: {
            assetSelectionId: request.assetSelectionRef.id,
            documentId: request.documentRef.id,
          },
          bitmap: output,
          effectInstanceId: request.effectInstanceId,
          height: output.height,
          kind: 'frame' as const,
          requestId: request.requestId,
          sequenceId: request.sequenceId,
          snapshotId: request.snapshotId,
          width: output.width,
        };
      }),
    },
    outputs,
    requests,
  };
}

function createTargetChainPlans(): EffectRuntimeFramePlan[] {
  return [
    createPlan('standalone', { clipId: 'host', kind: 'scene' }, 1280, 720),
    createPlan(
      'target-1',
      { chainIndex: 0, clipId: 'clip-a', kind: 'clip', placement: placement() },
      200,
      100
    ),
    createPlan(
      'target-2',
      { chainIndex: 1, clipId: 'clip-a', kind: 'clip', placement: placement() },
      200,
      100
    ),
  ];
}

function createPlan(
  id: string,
  target: EffectRuntimeFramePlan['target'],
  width: number,
  height: number
): EffectRuntimeFramePlan {
  return {
    assets: [],
    controls: {},
    dimensions: { height, width },
    renderDimensions: { height, width },
    documentSha256: 'a'.repeat(64),
    documentSource: '{}',
    duration: 2,
    effectInstanceId: id,
    fps: 30,
    frameIndex: 0,
    kind:
      target.kind === 'scene'
        ? 'standalone'
        : target.kind === 'clip'
          ? 'targetEffect'
          : 'transition',
    progress: 0,
    snapshotId: `effect:${'a'.repeat(64)}`,
    target,
    time: 0,
  };
}

function bitmap(label: string, width: number, height: number): FakeImageBitmap {
  return new FakeImageBitmap(width, height, label);
}

function placement() {
  return { height: 100, opacity: 1, rotation: 0, width: 200, x: 0, y: 0 };
}

it('orders clip, junction, track and global stages regardless of catalog insertion order', async () => {
  const requests: string[] = [];
  const plans = [
    createPlan('global', { kind: 'video-group', clipIds: ['a', 'b'] }, 200, 100),
    createPlan('track', { kind: 'track', trackId: 'v', clipIds: ['a', 'b'] }, 200, 100),
    createPlan(
      'junction',
      { kind: 'transition', leadingClipId: 'a', trailingClipId: 'b', transitionId: 't' },
      200,
      100
    ),
    createPlan(
      'clip',
      { kind: 'clip', clipId: 'a', chainIndex: 0, placement: placement() },
      200,
      100
    ),
  ].map((plan) => ({
    ...plan,
    kind: plan.target.kind === 'transition' ? ('transition' as const) : ('targetEffect' as const),
  }));
  const executor: EffectRuntimeSandboxExecutor = {
    dispose: vi.fn(),
    renderFrame: vi.fn(
      async (request: Parameters<EffectRuntimeSandboxExecutor['renderFrame']>[0]) => {
        requests.push(request.effectInstanceId);
        for (const input of Object.values(request.inputFrames)) input.bitmap.close();
        return {
          kind: 'frame' as const,
          bitmap: bitmap(request.effectInstanceId, 200, 100),
          width: 200,
          height: 100,
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
    ),
  };
  await renderEffectRuntimeFramePlans({
    executor,
    plans,
    inputMaterializer: {
      materializeTargetSource: async (plan, frames) => {
        if (plan.target.kind === 'track') expect(frames?.has('junction')).toBe(true);
        if (plan.target.kind === 'video-group') expect(frames?.has('track')).toBe(true);
        return bitmap('input', 200, 100);
      },
      materializeTransitionInputs: async (_plan, frames) => {
        expect(frames?.get('clip')?.bitmap).toMatchObject({ label: 'clip' });
        return { from: bitmap('a', 200, 100), to: bitmap('b', 200, 100) };
      },
    },
  });
  expect(requests).toEqual(['clip', 'junction', 'track', 'global']);
});

it.each([1, 2, 3])(
  'stops an aborted job after step %i and releases completed frames',
  async (stopAt) => {
    const controller = new AbortController();
    const fixture = createOrderedExecutor();
    const execute = fixture.executor.renderFrame;
    fixture.executor.renderFrame = vi.fn(async (request) => {
      const result = await execute(request);
      if (fixture.requests.length === stopAt) controller.abort();
      return result;
    });
    const materializeTargetSource = vi.fn(async () => bitmap('base', 200, 100));
    await expect(
      renderEffectRuntimeFramePlans({
        executor: fixture.executor,
        inputMaterializer: { materializeTargetSource, materializeTransitionInputs: vi.fn() },
        plans: createTargetChainPlans(),
        signal: controller.signal,
      })
    ).rejects.toThrow();
    expect(fixture.requests).toHaveLength(stopAt);
    expect(fixture.outputs.standalone.close).toHaveBeenCalledOnce();
    if (stopAt >= 2) expect(fixture.outputs.target1.close).toHaveBeenCalledOnce();
    if (stopAt === 3) expect(fixture.outputs.target2.close).toHaveBeenCalledOnce();
    if (stopAt === 1) expect(materializeTargetSource).not.toHaveBeenCalled();
  }
);

it('does not materialize inputs for an already aborted job', async () => {
  const fixture = createOrderedExecutor();
  const materializeTargetSource = vi.fn();
  await expect(
    renderEffectRuntimeFramePlans({
      executor: fixture.executor,
      inputMaterializer: { materializeTargetSource, materializeTransitionInputs: vi.fn() },
      plans: createTargetChainPlans().slice(1),
      signal: AbortSignal.abort(),
    })
  ).rejects.toThrow();
  expect(materializeTargetSource).not.toHaveBeenCalled();
  expect(fixture.requests).toHaveLength(0);
});

it('releases materialized inputs when cancellation arrives before dispatch', async () => {
  const fixture = createOrderedExecutor();
  const controller = new AbortController();
  const base = bitmap('cancelled-input', 200, 100);
  await expect(
    renderEffectRuntimeFramePlans({
      executor: fixture.executor,
      inputMaterializer: {
        materializeTargetSource: async () => {
          controller.abort();
          return base;
        },
        materializeTransitionInputs: vi.fn(),
      },
      plans: createTargetChainPlans().slice(1),
      signal: controller.signal,
    })
  ).rejects.toThrow();
  expect(fixture.requests).toHaveLength(0);
  expect(base.close).toHaveBeenCalledOnce();
});
