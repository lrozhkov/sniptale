import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { parseRuntimeAnimationDocument } from '../../../../../contracts/effect-runtime/animation';
import { createEmptyVideoProject } from '../../../project/factories/creation';
import { createEffectHostClip } from '../../../project/factories/overlay-clip';
import type { VideoProject } from '../../../project/types';
import { EffectRuntimeAudioPlanError, resolveEffectRuntimeAudioPlans } from './plan';

function fixture(): VideoProject {
  const template = parseRuntimeAnimationDocument({
    format: 'sniptale-animation',
    version: 1,
    id: 'silent-proof',
    label: { en: 'Silent proof' },
    resources: [],
    controls: [],
    bindings: [],
    animation: { v: '5.12.2', w: 320, h: 180, fr: 30, ip: 30, op: 120, layers: [], assets: [] },
  });
  if (!template) throw new Error('Invalid supported animation fixture.');
  const project = createEmptyVideoProject('Lottie audio boundary');
  project.version = 52;
  project.duration = 10;
  project.effectInstances = [
    {
      id: 'effect-1',
      snapshotId: 'pending',
      kind: 'standalone',
      target: { kind: 'scene' },
      enabled: true,
      controls: {},
      startTime: 2,
      duration: 1.5,
      playbackRate: 2,
    },
  ];
  project.clips = [
    createEffectHostClip({
      duration: 1.5,
      startTime: 2,
      effectInstanceId: 'effect-1',
      name: 'Animation',
      projectWidth: project.width,
      projectHeight: project.height,
      trackId: project.tracks[0]!.id,
    }),
  ];
  replaceSource(project, template);
  return project;
}

function replaceSource(project: VideoProject, value: unknown): void {
  const source = JSON.stringify(value);
  if (typeof source !== 'string') throw new Error('Invalid source fixture.');
  const sha256 = createHash('sha256').update(source).digest('hex');
  const snapshot = {
    id: `effect:${sha256}`,
    documentId: 'silent-proof',
    schemaVersion: 'sniptale.animation.v1' as const,
    kind: 'standalone' as const,
    source,
    sha256,
    retainedByteLength: Buffer.byteLength(source),
    assets: [],
  };
  project.effectSnapshots = [snapshot];
  project.effectInstances![0]!.snapshotId = snapshot.id;
}

it('keeps supported Lottie silent without rewriting ordinary project or source state', () => {
  const project = fixture(),
    before = structuredClone(project);
  expect(resolveEffectRuntimeAudioPlans(project)).toEqual([]);
  expect(project).toEqual(before);
  project.effectInstances![0]!.enabled = false;
  expect(resolveEffectRuntimeAudioPlans(project)).toEqual([]);
});

it('accepts a retained document subrange without manufacturing effect audio', () => {
  const project = fixture();
  Object.assign(project.effectInstances![0]!, { sourceStart: 1, startTime: 9, duration: 1 });
  Object.assign(project.clips[0]!, { startTime: 9, duration: 1 });
  expect(resolveEffectRuntimeAudioPlans(project)).toEqual([]);
});

it.each([-1, NaN, Infinity, 3])('rejects invalid retained source range %s', (sourceStart) => {
  const project = fixture();
  Object.assign(project.effectInstances![0]!, { sourceStart, duration: 1 });
  project.clips[0]!.duration = 1;
  expect(() => resolveEffectRuntimeAudioPlans(project)).toThrow(
    expect.objectContaining({ code: 'effectAudioIntegrityFailure' })
  );
});

it.each([0.7, 0.1 + 0.2])(
  'accepts fractional host timing %s within the existing shared epsilon',
  (duration) => {
    const project = fixture();
    Object.assign(project.effectInstances![0]!, { duration, playbackRate: 3 / duration });
    project.clips[0]!.duration = duration;
    expect(resolveEffectRuntimeAudioPlans(project)).toEqual([]);
  }
);

it.each(['missing-snapshot', 'kind', 'invalid-source', 'duration', 'document-id'])(
  'keeps %s failure explicit instead of selecting an audio fallback',
  (failure) => {
    const project = fixture(),
      snapshot = project.effectSnapshots![0]!,
      instance = project.effectInstances![0]!;
    if (failure === 'missing-snapshot') instance.snapshotId = 'missing';
    if (failure === 'kind') Object.assign(snapshot, { kind: 'transition' });
    if (failure === 'invalid-source') snapshot.source = '{';
    if (failure === 'duration') instance.duration = 2;
    if (failure === 'document-id') snapshot.documentId = 'foreign';
    expect(() => resolveEffectRuntimeAudioPlans(project)).toThrow(EffectRuntimeAudioPlanError);
    expect(() => resolveEffectRuntimeAudioPlans(project)).toThrow(
      expect.objectContaining({ code: 'effectAudioIntegrityFailure' })
    );
  }
);

it.each(['missing-host', 'wrong-target', 'host-time'])(
  'refuses %s without consuming the valid retained source',
  (failure) => {
    const project = fixture(),
      source = project.effectSnapshots![0]!.source;
    if (failure === 'missing-host') project.clips = [];
    if (failure === 'wrong-target')
      Object.assign(project.effectInstances![0]!, { target: { kind: 'clip', clipId: 'foreign' } });
    if (failure === 'host-time') project.clips[0]!.startTime += 1;
    expect(() => resolveEffectRuntimeAudioPlans(project)).toThrow(
      expect.objectContaining({ code: 'effectAudioTargetFailure' })
    );
    expect(project.effectSnapshots![0]!.source).toBe(source);
  }
);

it('refuses detached audio bytes before any decoding or materialization', () => {
  const project = fixture();
  project.effectSnapshots![0]!.assets = [
    {
      id: 'tone',
      blob: new Blob([Uint8Array.of(1)], { type: 'audio/wav' }),
      kind: 'audio',
      byteLength: 1,
      mimeType: 'audio/wav',
      sha256: 'a'.repeat(64),
    },
  ];
  expect(() => resolveEffectRuntimeAudioPlans(project)).toThrow(
    expect.objectContaining({ code: 'effectAudioIntegrityFailure' })
  );
});

it('refuses legacy layer audio even when the immutable package digest matches', () => {
  const project = fixture();
  replaceSource(project, {
    schemaVersion: 'sniptale.effect.v1',
    id: 'silent-proof',
    kind: 'standalone',
    duration: 3,
    program: { kind: 'graph', commands: [{ op: 'clear' }] },
    layers: [{ id: 'audio', type: 'audio' }],
  });
  expect(() => resolveEffectRuntimeAudioPlans(project)).toThrow(
    expect.objectContaining({ code: 'effectAudioIntegrityFailure' })
  );
});

it('rejects a Lottie audio layer rather than inventing an implicit audio track', () => {
  const project = fixture();
  const template = parseRuntimeAnimationDocument({
    format: 'sniptale-animation',
    version: 1,
    id: 'silent-proof',
    label: { en: 'Silent proof' },
    resources: [],
    controls: [],
    bindings: [],
    animation: { v: '5.12.2', w: 320, h: 180, fr: 30, ip: 30, op: 120, layers: [], assets: [] },
  });
  if (!template) throw new Error('Invalid animation fixture.');
  template.animation.layers = [{ ty: 6, ind: 1, ip: 30, op: 120, refId: 'audio' }];
  replaceSource(project, template);
  expect(() => resolveEffectRuntimeAudioPlans(project)).toThrow(
    expect.objectContaining({ code: 'effectAudioIntegrityFailure' })
  );
});
