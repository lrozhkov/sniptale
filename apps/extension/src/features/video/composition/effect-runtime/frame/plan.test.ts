import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { resolveEffectV1ObjectRenderBounds } from '@sniptale/runtime-contracts/effect-v1';
import { parseEffectRuntimeSnapshotDocument } from '../runtime/snapshot-document';

import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../project/factories/creation';
import { createEffectHostClip } from '../../../project/factories/overlay-clip';
import {
  VideoTrackKind,
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  VideoTransitionEasing,
  VideoTransitionKind,
  type VideoProject,
  type VideoProjectClip,
} from '../../../project/types/index';
import { resolveVideoCompositionFrame } from '../../timeline/frame/index';
import { shouldLockVisualLayerToViewport } from '../../motion/layer-camera';
import {
  createRecordingBaseClip,
  createRecordingProjectAsset,
} from '../../../project/factories/recording';
import { resolveEffectRuntimeFramePlans } from './plan';

describe('shared EffectV1 preview/export frame plan', () => {
  it('continues a standalone document subrange at its retained phase', () => {
    const project = createProject();
    const instance = project.effectInstances!.find(({ id }) => id === 'standalone-1')!;
    Object.assign(instance, { sourceStart: 2, startTime: 9, duration: 1 });
    Object.assign(
      project.clips.find(({ id }) => id === 'standalone-host')!,
      { startTime: 9, duration: 1 }
    );
    expect(resolveEffectRuntimeFramePlans(project, 9.5)).toEqual([
      expect.objectContaining({ effectInstanceId: instance.id, time: 2.5 }),
    ]);
  });
  it.each([-1, NaN, Infinity, 3])('rejects invalid retained frame range %s', (sourceStart) => {
    const project = createProject();
    Object.assign(project.effectInstances![0]!, { sourceStart, duration: 1 });
    expect(() => resolveEffectRuntimeFramePlans(project, 0.5)).toThrow(
      expect.objectContaining({ code: 'effectPlanIntegrityFailure' })
    );
  });
  it('owns standalone, stable target chains, and transition timing without fallback', () => {
    const plans = resolveEffectRuntimeFramePlans(createProject(), 2.5);

    expect(plans.map(({ effectInstanceId }) => effectInstanceId)).toEqual([
      'standalone-1',
      'target-1',
      'target-2',
      'transition-1',
    ]);
    expectStandalonePlan(plans[0]);
    expectTargetPlans(plans[1], plans[2]);
    expectTransitionPlan(plans[3]);
  });

  it('fails typed when persisted transition timing diverges from its owner segment', () => {
    const project = createProject();
    project.effectInstances![3] = { ...project.effectInstances![3]!, startTime: 1.5 };

    expect(() => resolveEffectRuntimeFramePlans(project, 2.25)).toThrow(
      expect.objectContaining({ code: 'effectTransitionTimingMismatch' })
    );
  });

  it('does not request transition inputs at the half-open segment end', () => {
    const project = createProject();

    expect(resolveEffectRuntimeFramePlans(project, 3)).toEqual([]);
  });

  it('keeps both pre-effect transition rasters available at the transparent segment start', () => {
    const frame = resolveVideoCompositionFrame(createProject(), 2);

    expect(frame.visualLayers.map(({ clipId }) => clipId)).not.toContain('clip-b');
    expect(frame.effectInputLayers.map(({ clipId }) => clipId)).toEqual(['clip-a', 'clip-b']);
    expect(frame.effectRuntimePlans.some(({ kind }) => kind === 'transition')).toBe(true);
  });

  it('does not request target or transition work from hidden tracks', () => {
    const project = createProject();
    project.tracks[0]!.visible = false;

    expect(
      resolveEffectRuntimeFramePlans(project, 2.5).map(({ effectInstanceId }) => effectInstanceId)
    ).toEqual(['standalone-1']);
  });
});

function expectStandalonePlan(plan: unknown): void {
  expect(plan).toMatchObject({
    dimensions: { height: 180, width: 320 },
    kind: 'standalone',
    target: { clipId: 'standalone-host', kind: 'scene' },
    time: 2.5,
  });
}

function expectTargetPlans(firstPlan: unknown, secondPlan: unknown): void {
  expect(firstPlan).toMatchObject({
    dimensions: { height: 100, width: 200 },
    kind: 'targetEffect',
    target: { chainIndex: 0, clipId: 'clip-a', kind: 'clip' },
  });
  expect(secondPlan).toMatchObject({
    target: { chainIndex: 1, clipId: 'clip-a', kind: 'clip' },
  });
}

function expectTransitionPlan(plan: unknown): void {
  expect(plan).toMatchObject({
    dimensions: { height: 720, width: 1280 },
    kind: 'transition',
    progress: 0.5,
    target: {
      kind: 'transition',
      leadingClipId: 'clip-a',
      trailingClipId: 'clip-b',
      transitionId: 'transition-1',
    },
    time: 1.5,
  });
}

function createProject(): VideoProject {
  const project = createEmptyVideoProject('Effect runtime', 1280, 720);
  project.tracks.push(createVideoProjectTrack('Annotations', 0, VideoTrackKind.PRIMARY));
  const trackId = project.tracks[0]!.id;
  project.duration = 5;
  project.clips = [createClip('clip-a', trackId, 0), createClip('clip-b', trackId, 2)];
  project.transitions = [
    {
      duration: 1,
      easing: VideoTransitionEasing.LINEAR,
      id: 'transition-1',
      kind: VideoTransitionKind.CROSSFADE,
      leadingClipId: 'clip-a',
      trailingClipId: 'clip-b',
    },
  ];
  attachEffectRuntimeState(project);
  return project;
}

function attachEffectRuntimeState(project: VideoProject): void {
  const standalone = createSnapshot('standalone', 1);
  const target = createSnapshot('targetEffect', 2);
  const transition = createSnapshot('transition', 3);
  project.effectSnapshots = [standalone, target, transition];
  project.clips.push(createStandaloneHost(project));
  project.effectInstances = [
    {
      controls: readDefaults(standalone.source),
      duration: 3,
      enabled: true,
      id: 'standalone-1',
      kind: 'standalone',
      playbackRate: 1,
      snapshotId: standalone.id,
      startTime: 0,
      target: { kind: 'scene' },
    },
    ...['target-1', 'target-2'].map((id) => ({
      controls: readDefaults(target.source),
      duration: 3,
      enabled: true,
      id,
      kind: 'targetEffect' as const,
      playbackRate: 1,
      snapshotId: target.id,
      startTime: 0,
      target: { clipId: 'clip-a', kind: 'clip' as const },
    })),
    {
      controls: readDefaults(transition.source),
      duration: 1,
      enabled: true,
      id: 'transition-1',
      kind: 'transition',
      playbackRate: 3,
      snapshotId: transition.id,
      startTime: 2,
      target: { kind: 'transition', transitionId: 'transition-1' },
    },
  ];
}

function createStandaloneHost(project: VideoProject) {
  const trackId = project.tracks.find(({ name }) => name === 'Annotations')?.id;
  if (!trackId) throw new Error('Expected overlay track');
  const host = createEffectHostClip({
    duration: 3,
    effectInstanceId: 'standalone-1',
    name: 'standalone',
    projectHeight: project.height,
    projectWidth: project.width,
    startTime: 0,
    trackId,
  });
  host.id = 'standalone-host';
  host.transform = {
    height: 180,
    opacity: 1,
    rotation: 0,
    width: 320,
    x: 40,
    y: 50,
  };
  return host;
}

function createSnapshot(kind: 'standalone' | 'targetEffect' | 'transition', index: number) {
  const fileName =
    kind === 'targetEffect'
      ? 'neutral-target-effect.sniptale-effect.json'
      : `neutral-${kind}.sniptale-effect.json`;
  const source = readFileSync(
    new URL(
      `../../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/${fileName}`,
      import.meta.url
    ),
    'utf8'
  );
  const parsed = JSON.parse(source) as { id: string };
  const sha256 = String(index).repeat(64);
  return {
    assets: [],
    documentId: parsed.id,
    id: `effect:${sha256}`,
    kind,
    retainedByteLength: new TextEncoder().encode(source).byteLength,
    schemaVersion: 'sniptale.effect.v1' as const,
    sha256,
    source,
  };
}

function readDefaults(source: string): Record<string, number | string> {
  const parsed = JSON.parse(source) as {
    controls: Array<{ defaultValue: number | string; id: string }>;
  };
  return Object.fromEntries(parsed.controls.map(({ defaultValue, id }) => [id, defaultValue]));
}

function createClip(id: string, trackId: string, startTime: number): VideoProjectClip {
  return {
    assetId: `${id}-asset`,
    duration: 3,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id,
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: id,
    startTime,
    trackId,
    transform: { height: 100, opacity: 1, rotation: 0, width: 200, x: 10, y: 20 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.IMAGE,
    volume: 1,
  };
}

it('separates extended negative raster bounds from rotated body placement and stable local time', () => {
  const project = createProject();
  const snapshot = project.effectSnapshots![0]!;
  const source = readFileSync(
    new URL(
      '../../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/collection/' +
        'sniptale-callout.sniptale-effect.json',
      import.meta.url
    ),
    'utf8'
  );
  snapshot.source = source;
  snapshot.documentId = 'sniptale-callout';
  const instance = project.effectInstances![0]!;
  instance.controls = {};
  instance.sceneAnchors = { tip: { x: 0, y: 0 } };
  const host = project.clips.find((c) => c.id === 'standalone-host')!;
  host.transform = { ...host.transform, x: 600, y: 400, width: 760, height: 240, rotation: 37 };
  const plan = resolveEffectRuntimeFramePlans(project, 1).find(
    (p) => p.effectInstanceId === instance.id
  )!;
  expect(plan.target).toMatchObject({ placement: host.transform });
  expect(plan.controls['anchorX']).toBeLessThan(0);
  expect(plan.bitmapBounds!.x).toBeLessThan(0);
  expect(plan.dimensions.width).toBeCloseTo(host.transform.width * plan.bitmapBounds!.width, 8);
  expect(plan.renderDimensions.width * plan.renderDimensions.height).toBeLessThanOrEqual(8_388_608);
  expect(
    resolveEffectRuntimeFramePlans(project, 0).find((p) => p.effectInstanceId === instance.id)!
      .bitmapBounds
  ).toEqual(plan.bitmapBounds);
  expect(
    resolveEffectRuntimeFramePlans(project, 1).find((p) => p.effectInstanceId === instance.id)
  ).toEqual(plan);
});

it('preserves an external callout pointer through its clip FX chain', () => {
  const project = createProject();
  const source = readFileSync(
    'packages/runtime-contracts/src/effect-v1/fixtures/collection/sniptale-callout.sniptale-effect.json',
    'utf8'
  );
  Object.assign(project.effectSnapshots![0]!, { source, documentId: 'sniptale-callout' });
  Object.assign(project.effectInstances![0]!, {
    controls: {},
    sceneAnchors: { tip: { x: -200, y: -100 } },
  });
  for (const instance of project.effectInstances!.filter((item) => item.kind === 'targetEffect'))
    instance.target = { kind: 'clip', clipId: 'standalone-host' };
  const plans = resolveEffectRuntimeFramePlans(project, 1);
  const host = plans.find((plan) => plan.kind === 'standalone')!;
  expect(host.bitmapBounds!.x).toBeLessThan(0);
  for (const fx of plans.filter((plan) => plan.kind === 'targetEffect')) {
    expect(fx.bitmapBounds).toEqual(host.bitmapBounds);
    expect(fx.dimensions).toEqual(host.dimensions);
    expect(fx.renderDimensions).toEqual(host.renderDimensions);
  }
});

it.each(['title', 'callout', 'corners', 'frame'])(
  'keeps %s annotation geometry and current frame at fractional time',
  (name) => {
    const project = createProject();
    const snapshot = project.effectSnapshots![0]!;
    const source = readFileSync(
      `apps/extension/public/video-effects/effects/annotations/sniptale-${name}/effect.sniptale-effect.json`,
      'utf8'
    );
    snapshot.source = source;
    const document = parseEffectRuntimeSnapshotDocument(snapshot);
    snapshot.documentId = document.id;
    const instance = project.effectInstances![0]!;
    instance.controls = Object.fromEntries(
      document.controls.map((control) => [control.id, control.defaultValue])
    );
    instance.sceneAnchors = { tip: { x: -100, y: -70 } };
    const host = project.clips.find((clip) => clip.id === 'standalone-host')!;
    host.transform = {
      ...host.transform,
      width: document.objectLayout!.width * 2,
      height: document.objectLayout!.height * 2,
      rotation: 23,
    };
    const plan = resolveEffectRuntimeFramePlans(project, 1.019).find(
      (entry) => entry.effectInstanceId === instance.id
    )!;
    const layout = document.objectLayout!;
    const local =
      layout.resize === 'reflow'
        ? { ...layout, width: host.transform.width, height: host.transform.height }
        : layout;
    const bounds = resolveEffectV1ObjectRenderBounds(local, plan.controls);
    expect(plan.dimensions.width).toBeCloseTo(
      (host.transform.width * bounds.width) / local.width,
      7
    );
    expect(plan.dimensions.height).toBeCloseTo(
      (host.transform.height * bounds.height) / local.height,
      7
    );
    expect(plan.bitmapBounds ?? { x: 0, y: 0, width: 1, height: 1 }).toEqual({
      x: bounds.x / local.width,
      y: bounds.y / local.height,
      width: bounds.width / local.width,
      height: bounds.height / local.height,
    });
    expect(plan.renderDimensions.width).toBeCloseTo(
      Math.floor((host.transform.width * bounds.width) / local.width),
      0
    );
    expect(plan.renderDimensions.height).toBeCloseTo(
      Math.floor((host.transform.height * bounds.height) / local.height),
      0
    );
    expect(plan.time).toBeCloseTo(1.019, 7);
    expect(plan.frameIndex).toBe(Math.floor(plan.time * project.fps));
  }
);

it('projects an ordinary effect onto its exact source and keeps missing placements dormant', () => {
  const project = createProject();
  const asset = createRecordingProjectAsset({
    duration: 5,
    filename: 'source.webm',
    width: 1280,
    height: 720,
    recordingId: 'source-recording',
    mimeType: 'video/webm',
    size: 1,
  });
  const source = createRecordingBaseClip(
    asset,
    { duration: 5, width: 1280, height: 720 },
    project.tracks[0]!.id,
    null
  );
  source.sourceInstanceId = 'source-placement';
  source.transform = { ...source.transform, x: 100, y: 60, width: 640, height: 360 };
  source.sourceCrop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
  const second = { ...source, id: 'second', sourceInstanceId: 'another-placement' };
  const host = project.clips.find((clip) => clip.type === 'EFFECT')!;
  if (host.type !== 'EFFECT') throw new Error('Expected effect host');
  host.attachment = {
    kind: 'source',
    assetId: asset.id,
    sourceInstanceId: source.sourceInstanceId,
  };
  project.assets = [asset];
  project.clips = [source, second, host];
  project.transitions = [];
  project.effectInstances = [project.effectInstances![0]!];
  const frame = resolveVideoCompositionFrame(project, 1);
  const effect = frame.visualLayers.find((layer) => layer.clipId === host.id)!;
  if (effect.kind !== 'effect') throw new Error('Expected effect layer');
  expect(effect.sourceAttachment?.owner.clipId).toBe(source.id);
  expect(effect.sourceAttachment?.mapping.sourceCrop).toEqual(source.sourceCrop);
  expect(effect.sourceAttachment?.mapping.frame).toEqual(source.transform);
  expect(effect.clip.transform).toEqual(host.transform);
  expect(frame.effectRuntimePlans).toHaveLength(1);
  expect(
    shouldLockVisualLayerToViewport(effect, { ...frame.camera, sourceClipId: source.id })
  ).toBe(false);
  expect(
    shouldLockVisualLayerToViewport(effect, { ...frame.camera, sourceClipId: second.id })
  ).toBe(true);

  const tail = {
    ...source,
    id: 'tail',
    startTime: 2,
    duration: 3,
    sourceStart: 2,
    sourceDuration: 3,
  };
  project.clips = [{ ...source, duration: 2, sourceDuration: 2 }, tail, second, host];
  const afterSplit = resolveVideoCompositionFrame(project, 2);
  const tailEffect = afterSplit.visualLayers.find((layer) => layer.clipId === host.id)!;
  if (tailEffect.kind !== 'effect') throw new Error('Expected effect layer');
  expect(tailEffect.sourceAttachment?.owner.clipId).toBe(tail.id);
  expect(afterSplit.effectRuntimePlans[0]!.time).toBe(2);
  project.clips = [second, host];
  const missing = resolveVideoCompositionFrame(project, 1);
  expect(missing.effectRuntimePlans).toEqual([]);
  expect(missing.visualLayers.some((layer) => layer.clipId === host.id)).toBe(false);
  expect(host.attachment.sourceInstanceId).toBe('source-placement');
  host.attachment = { kind: 'viewport' };
  const viewport = resolveVideoCompositionFrame(project, 1);
  const viewportEffect = viewport.visualLayers.find((layer) => layer.clipId === host.id)!;
  expect(
    shouldLockVisualLayerToViewport(viewportEffect, {
      ...viewport.camera,
      overlayZoomMode: 'FOLLOW_CAMERA',
    })
  ).toBe(true);
});

it('retains a standalone content clock through a held placement and reopen', () => {
  const project = createProject();
  const host = project.clips.find(({ id }) => id === 'standalone-host')!;
  Object.assign(host, { duration: 3.3, playbackWindow: { offset: 0, holdAt: 2.9 } });
  project.version = 43;
  const before = resolveEffectRuntimeFramePlans(project, 3.2);
  expect(before).toEqual([
    expect.objectContaining({ effectInstanceId: 'standalone-1', time: 2.9 }),
  ]);
  expect(resolveEffectRuntimeFramePlans(project, 3.3)).toEqual([]);
  const reopened = JSON.parse(JSON.stringify(project));
  expect(resolveEffectRuntimeFramePlans(reopened, 3.2)).toEqual([
    expect.objectContaining({ time: 2.9 }),
  ]);
});
