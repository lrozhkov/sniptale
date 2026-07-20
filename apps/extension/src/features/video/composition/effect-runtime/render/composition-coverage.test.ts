import { expect, it, vi } from 'vitest';

import {
  EFFECT_V1_SCHEMA,
  type EffectV1Command,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
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

it('serializes exact visual asset bytes while excluding audio payloads', async () => {
  const plan = createPlan();
  plan.assets = [
    createAsset('image', new Blob(['image']), 'image/png'),
    createAsset('audio', new Blob(['audio']), 'audio/wav'),
  ];
  const source = new FakeBitmap(10, 10);

  const command = await createEffectRuntimeRenderMessage({
    inputFrames: { source: { bitmap: source, height: 10, width: 10 } },
    plan,
    requestId: 'request',
    sequenceId: 2,
  });

  expect(command).toMatchObject({
    assetSelectionRef: { id: expect.stringMatching(/^[a-f0-9]{64}$/u) },
    inputFrames: { source: { bitmap: source } },
    requestId: 'request',
    sequenceId: 2,
  });
  await expect(command.materializeImmutablePayloads()).resolves.toMatchObject({
    assets: [{ id: 'image', kind: 'image' }],
  });
});

it('fails when retained asset metadata and readable blob bytes diverge', async () => {
  const plan = createPlan();
  plan.assets = [{ ...createAsset('image', new Blob(['x']), 'image/png'), byteLength: 2 }];

  const command = await createEffectRuntimeRenderMessage({
    inputFrames: {},
    plan,
    requestId: 'request',
    sequenceId: 1,
  });

  await expect(command.materializeImmutablePayloads()).rejects.toThrow(
    'EFFECT_RUNTIME_ASSET_READ_FAILED'
  );
});

it('parses only validated bounded snapshot documents', () => {
  const source = JSON.stringify(createDocument([{ op: 'clear' }]));

  expect(parseEffectRuntimeSnapshotDocument(source)).toMatchObject({ id: 'safe-graph' });
  expect(() => parseEffectRuntimeSnapshotDocument('{')).toThrow(
    'Effect runtime snapshot document is invalid'
  );
  expect(() => parseEffectRuntimeSnapshotDocument('{}')).toThrow(
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
    documentSha256: 'a'.repeat(64),
    documentSource: '{}',
    duration: 2,
    effectInstanceId: 'effect',
    fps: 30,
    frameIndex: 0,
    kind: 'targetEffect',
    progress: 0,
    snapshotId: 'snapshot',
    target: {
      chainIndex: 0,
      clipId: 'clip',
      kind: 'clip',
      placement: { height: 10, opacity: 1, rotation: 0, width: 10, x: 0, y: 0 },
    },
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

function createDocument(commands: EffectV1Command[]): EffectV1Document {
  return {
    assets: [],
    clips: [],
    controls: [],
    duration: 2,
    id: 'safe-graph',
    kind: 'standalone',
    label: { en: 'Safe graph', ru: 'Безопасный граф' },
    layers: [],
    program: { commands, kind: 'graph', version: 1 },
    scenes: [{ duration: 2, id: 'main', start: 0 }],
    schemaVersion: EFFECT_V1_SCHEMA,
    timeline: { phases: [], tracks: [] },
  };
}
