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
