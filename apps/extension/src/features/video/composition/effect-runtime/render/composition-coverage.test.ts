import { expect, it, vi } from 'vitest';

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const source = readFileSync(
  'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json',
  'utf8'
);
const hash = createHash('sha256').update(source).digest('hex');
import { createEffectRuntimeRenderMessage } from '../runtime/request';
import { parseEffectRuntimeSnapshotDocument } from '../runtime/snapshot-document';
import { disposeEffectRuntimeComposition, getEffectRuntimeVisualPassFrames } from './rendered';
import { isSameEffectTarget, type EffectRuntimeFramePlan } from '../runtime/types';

class FakeBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

it('serializes the exact self-contained source without detached raster or audio payloads', async () => {
  const command = await createEffectRuntimeRenderMessage({
    inputFrames: {},
    plan: createPlan(),
    requestId: 'request',
    sequenceId: 2,
  });
  expect(command).toMatchObject({
    documentRef: { id: hash },
    assetSelectionRef: { id: expect.stringMatching(/^[a-f0-9]{64}$/u) },
    inputFrames: {},
    requestId: 'request',
    sequenceId: 2,
  });
  await expect(command.materializeImmutablePayloads()).resolves.toEqual({
    assets: [],
    documentSource: source,
  });
});
it.each(['image', 'audio'])(
  'refuses detached %s resources before constructing the sandbox request',
  async (kind) => {
    const plan = createPlan();
    plan.assets = [
      createAsset(kind, new Blob(['resource']), kind === 'audio' ? 'audio/wav' : 'image/png'),
    ];
    await expect(
      createEffectRuntimeRenderMessage({
        inputFrames: {},
        plan,
        requestId: 'request',
        sequenceId: 0,
      })
    ).rejects.toThrow('EFFECT_RUNTIME_ANIMATION_INPUT_REJECTED');
  }
);
it('refuses source-video frame inputs before constructing the sandbox request', async () => {
  await expect(
    createEffectRuntimeRenderMessage({
      inputFrames: { source: { bitmap: new FakeBitmap(10, 10), height: 10, width: 10 } },
      plan: createPlan(),
      requestId: 'request',
      sequenceId: 0,
    })
  ).rejects.toThrow('EFFECT_RUNTIME_ANIMATION_INPUT_REJECTED');
});
it('retains the integrity check when immutable source bytes are materialized', async () => {
  const plan = createPlan();
  plan.documentSha256 = 'f'.repeat(64);
  const command = await createEffectRuntimeRenderMessage({
    inputFrames: {},
    plan,
    requestId: 'request',
    sequenceId: 0,
  });
  await expect(command.materializeImmutablePayloads()).rejects.toThrow(
    'EFFECT_RUNTIME_ANIMATION_INTEGRITY_FAILED'
  );
});
it('parses only validated bounded self-contained animation source', () => {
  expect(parseEffectRuntimeSnapshotDocument({ source })).toMatchObject({ id: 'sniptale-callout' });
  for (const invalid of ['{', '{}'])
    expect(() => parseEffectRuntimeSnapshotDocument({ source: invalid })).toThrow(
      'Effect runtime snapshot document is invalid'
    );
});

it('reads and disposes unique rendered frame authorities exactly once', () => {
  const sharedBitmap = new FakeBitmap(10, 10);
  const overlayBitmap = new FakeBitmap(10, 10);
  const shared = new Map([['shared', createFrame(sharedBitmap)]]);
  const overlay = new Map([['overlay', createFrame(overlayBitmap)]]);
  const rendered = {
    framesByTime: new Map([
      [0, shared],
      [1, shared],
    ]),
    overlayFrames: overlay,
  };

  expect(getEffectRuntimeVisualPassFrames(rendered, 0)).toBe(shared);
  expect(getEffectRuntimeVisualPassFrames(undefined, 0)).toBeUndefined();
  disposeEffectRuntimeComposition(rendered);
  disposeEffectRuntimeComposition(undefined);
  expect(sharedBitmap.close).toHaveBeenCalledOnce();
  expect(overlayBitmap.close).toHaveBeenCalledOnce();
});

it('compares scene, clip, transition, and cross-kind targets without coercion', () => {
  expect(isSameEffectTarget({ kind: 'scene' }, { kind: 'scene' })).toBe(true);
  expect(isSameEffectTarget({ kind: 'scene' }, { clipId: 'a', kind: 'clip' })).toBe(false);
  expect(isSameEffectTarget({ clipId: 'a', kind: 'clip' }, { clipId: 'a', kind: 'clip' })).toBe(
    true
  );
  expect(isSameEffectTarget({ clipId: 'a', kind: 'clip' }, { clipId: 'b', kind: 'clip' })).toBe(
    false
  );
  expect(
    isSameEffectTarget(
      { kind: 'transition', transitionId: 'a' },
      { kind: 'transition', transitionId: 'a' }
    )
  ).toBe(true);
});

function createPlan(): EffectRuntimeFramePlan {
  return {
    assets: [],
    controls: {},
    dimensions: { height: 10, width: 10 },
    renderDimensions: { height: 10, width: 10 },
    documentSha256: hash,
    documentSource: source,
    duration: 2,
    effectInstanceId: 'effect',
    fps: 30,
    frameIndex: 0,
    kind: 'standalone',
    progress: 0,
    snapshotId: 'snapshot',
    target: { kind: 'scene', clipId: 'host' },
    time: 0,
  };
}

function createAsset(id: string, blob: Blob, mimeType: string) {
  return {
    blob,
    byteLength: blob.size,
    id,
    kind: id === 'audio' ? ('audio' as const) : ('image' as const),
    mimeType,
    sha256: id.padEnd(64, '0'),
  };
}

function createFrame(bitmap: ImageBitmap) {
  return {
    bitmap,
    effectInstanceId: 'effect',
    height: 10,
    kind: 'standalone' as const,
    logicalHeight: 10,
    logicalWidth: 10,
    snapshotId: 'snapshot',
    target: { clipId: 'host', kind: 'scene' as const },
    width: 10,
  };
}
