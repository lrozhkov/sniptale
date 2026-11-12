import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseAnimationTemplateSource,
  resolveAnimationObjectRenderBounds,
} from '@sniptale/runtime-contracts/animation-template';
import { parseRuntimeAnimationDocument } from '../../../../../contracts/effect-runtime/animation';
import { createGlTransitionSelection } from '../../../project/transition/gl-catalog';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
  createVideoProjectAsset,
} from '../../../project/factories/creation';
import { createEffectHostClip } from '../../../project/factories/overlay-clip';
import {
  VideoTrackKind,
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  VideoTransitionEasing,
  type VideoProject,
  type VideoProjectClip,
} from '../../../project/types/index';
import { resolveVideoCompositionFrame } from '../../timeline/frame/index';
import { shouldLockVisualLayerToViewport } from '../../motion/layer-camera';
import {
  createRecordingBaseClip,
  createRecordingProjectAsset,
} from '../../../project/factories/recording';
import { isHydratableVideoProject } from '../../../project/validation/root';
import { hydrateVideoProject } from '../../../project/hydration';
import { parseEffectRuntimeSnapshotDocument } from '../runtime/snapshot-document';
import { resolveEffectRuntimeFramePlans } from './plan';

function createSnapshot(name?: string) {
  const neutral = parseRuntimeAnimationDocument({
    format: 'sniptale-animation',
    version: 1,
    id: 'neutral-standalone',
    label: { en: 'Neutral' },
    resources: [],
    controls: [],
    bindings: [],
    animation: { v: '5.12.2', w: 320, h: 180, fr: 30, ip: 30, op: 120, layers: [], assets: [] },
  });
  if (!neutral) throw new Error('Invalid neutral animation fixture');
  const source = name
    ? readFileSync(
        `apps/extension/public/video-effects/animations/${name}.sniptale-animation.json`,
        'utf8'
      )
    : JSON.stringify(neutral);
  const accepted = parseAnimationTemplateSource(source);
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.diagnostics));
  const hash = createHash('sha256').update(source).digest('hex');
  return {
    assets: [],
    documentId: accepted.template.id,
    id: `effect:${hash}`,
    kind: 'standalone' as const,
    retainedByteLength: Buffer.byteLength(source),
    schemaVersion: 'sniptale.animation.v1' as const,
    sha256: hash,
    source,
  };
}
function replaceSnapshot(project: VideoProject, name?: string) {
  const snapshot = createSnapshot(name),
    document = parseEffectRuntimeSnapshotDocument(snapshot);
  project.effectSnapshots = [snapshot];
  project.effectInstances![0]!.snapshotId = snapshot.id;
  project.effectInstances![0]!.controls = Object.fromEntries(
    document.controls.map((control) => [control.id, control.defaultValue])
  );
  for (const handle of document.objectLayout?.handles ?? []) {
    delete project.effectInstances![0]!.controls[handle.xControl];
    delete project.effectInstances![0]!.controls[handle.yControl];
  }
  return document;
}
function createProject(): VideoProject {
  const project = createEmptyVideoProject('Animation runtime', 1280, 720);
  project.version = 52;
  project.tracks.push(createVideoProjectTrack('Annotations', 0, VideoTrackKind.PRIMARY));
  const trackId = project.tracks[0]!.id;
  project.duration = 5;
  project.clips = [createClip('clip-a', trackId, 0), createClip('clip-b', trackId, 2)];
  project.assets = ['clip-a', 'clip-b'].map((id) => ({
    ...createVideoProjectAsset(
      id,
      'IMAGE',
      { kind: 'project-asset', projectAssetId: `${id}-material` },
      {
        width: 200,
        height: 100,
        duration: null,
        mimeType: 'image/png',
        size: 24,
        hasAudio: false,
        audioPeaks: null,
      }
    ),
    id: `${id}-asset`,
  }));
  project.transitions = [
    {
      duration: 1,
      easing: VideoTransitionEasing.LINEAR,
      id: 'transition-1',
      kind: 'gl',
      selection: createGlTransitionSelection('Fade')!,
      leadingClipId: 'clip-a',
      trailingClipId: 'clip-b',
    },
  ];
  const snapshot = createSnapshot();
  project.effectSnapshots = [snapshot];
  project.effectInstances = [
    {
      controls: {},
      duration: 3,
      enabled: true,
      id: 'standalone-1',
      kind: 'standalone',
      playbackRate: 1,
      snapshotId: snapshot.id,
      startTime: 0,
      target: { kind: 'scene' },
    },
  ];
  const host = createEffectHostClip({
    duration: 3,
    effectInstanceId: 'standalone-1',
    name: 'Standalone',
    projectHeight: 720,
    projectWidth: 1280,
    startTime: 0,
    trackId: project.tracks[1]!.id,
  });
  host.id = 'standalone-host';
  host.transform = { height: 180, width: 320, opacity: 1, rotation: 0, x: 40, y: 50 };
  project.clips.push(host);
  return project;
}

describe('shared Lottie preview/export frame plan', () => {
  it('continues a standalone document subrange at its retained phase', () => {
    const project = createProject(),
      instance = project.effectInstances![0]!;
    Object.assign(instance, { sourceStart: 2, startTime: 9, duration: 1 });
    Object.assign(
      project.clips.find((clip) => clip.id === 'standalone-host')!,
      { startTime: 9, duration: 1 }
    );
    project.duration = 10;
    expect(resolveEffectRuntimeFramePlans(project, 9.5)).toEqual([
      expect.objectContaining({ effectInstanceId: instance.id, time: 2.5 }),
    ]);
  });
  it.each([-1, NaN, Infinity, 3])('rejects invalid retained frame range %s', (sourceStart) => {
    const project = createProject();
    Object.assign(project.effectInstances![0]!, { sourceStart, duration: 1 });
    Object.assign(
      project.clips.find((clip) => clip.id === 'standalone-host')!,
      { duration: 1 }
    );
    expect(() => resolveEffectRuntimeFramePlans(project, 0.5)).toThrow(
      expect.objectContaining({ code: 'effectPlanIntegrityFailure' })
    );
  });
  it('owns the animation clock independently from the GL source transition', () => {
    const plans = resolveEffectRuntimeFramePlans(createProject(), 2.5);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      effectInstanceId: 'standalone-1',
      dimensions: { width: 320, height: 180 },
      kind: 'standalone',
      target: { kind: 'scene', clipId: 'standalone-host' },
      time: 2.5,
      duration: 3,
    });
  });
  it.each(['targetEffect', 'transition'] as const)(
    'refuses retired %s annotation execution instead of selecting a fallback',
    (kind) => {
      const project = createProject();
      Reflect.set(project.effectInstances![0]!, 'kind', kind);
      Reflect.set(project.effectSnapshots![0]!, 'kind', kind);
      expect(() => resolveEffectRuntimeFramePlans(project, 2.5)).toThrow(
        expect.objectContaining({ code: 'effectPlanIntegrityFailure' })
      );
    }
  );
  it('does not request an annotation frame at its half-open interval end', () => {
    expect(resolveEffectRuntimeFramePlans(createProject(), 3)).toEqual([]);
  });
  it('keeps canonical GL sources while the annotation owns no source-frame inputs', () => {
    const frame = resolveVideoCompositionFrame(createProject(), 2);
    expect(frame.visualLayers.map((layer) => layer.clipId)).toEqual(
      expect.arrayContaining(['clip-a', 'clip-b', 'standalone-host'])
    );
    expect(frame.glTrackPlans?.size).toBe(1);
    expect(frame.effectInputLayers).toEqual([]);
    expect(frame.effectRuntimePlans.map((plan) => plan.kind)).toEqual(['standalone']);
  });
  it('keeps annotation visibility independent from source tracks and editing locks', () => {
    const project = createProject();
    project.tracks[0]!.visible = false;
    expect(
      resolveEffectRuntimeFramePlans(project, 2.5).map((plan) => plan.effectInstanceId)
    ).toEqual(['standalone-1']);
    project.tracks[1]!.locked = true;
    expect(resolveEffectRuntimeFramePlans(project, 2.5)).toHaveLength(1);
    project.tracks[1]!.visible = false;
    expect(resolveEffectRuntimeFramePlans(project, 2.5)).toEqual([]);
  });
});
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

it('separates negative object bounds from rotated body placement and the local source clock', () => {
  const project = createProject(),
    document = replaceSnapshot(project, 'callout'),
    instance = project.effectInstances![0]!;
  instance.sceneAnchors = { tip: { x: 0, y: 0 } };
  const host = project.clips.find((clip) => clip.id === 'standalone-host')!;
  host.transform = { ...host.transform, x: 600, y: 400, width: 760, height: 427.5, rotation: 37 };
  const plan = resolveEffectRuntimeFramePlans(project, 1)[0]!;
  const layer = resolveVideoCompositionFrame(project, 1).visualLayers.find(
    (layer) => layer.clipId === host.id
  )!;
  expect(layer.kind).toBe('effect');
  if (layer.kind !== 'effect') throw new Error('Missing supported annotation layer');
  expect(layer.clip.transform).toEqual(host.transform);
  expect(plan.target).toEqual({ kind: 'scene', clipId: host.id });
  expect(plan.controls['tipX']).toBeLessThan(0);
  expect(plan.bitmapBounds!.x).toBeLessThan(0);
  expect(plan.dimensions.width).toBeCloseTo(document.animation.w * plan.bitmapBounds!.width, 8);
  expect(plan.renderDimensions.width * plan.renderDimensions.height).toBeLessThanOrEqual(8388608);
  const start = resolveEffectRuntimeFramePlans(project, 0)[0]!;
  expect(start.bitmapBounds).toEqual(plan.bitmapBounds);
  expect(start.time).toBe(0);
  expect(plan.time).toBe(1);
});
it('preserves external annotation coverage while GL transitions compose the ordinary source track', () => {
  const project = createProject();
  replaceSnapshot(project, 'callout');
  project.effectInstances![0]!.sceneAnchors = { tip: { x: -200, y: -100 } };
  const before = resolveEffectRuntimeFramePlans(project, 1)[0]!,
    frame = resolveVideoCompositionFrame(project, 2.5);
  expect(before.bitmapBounds!.x).toBeLessThan(0);
  expect(frame.glTrackPlans?.size).toBe(1);
  expect(frame.effectRuntimePlans).toHaveLength(1);
  expect(frame.effectRuntimePlans[0]!.bitmapBounds).toEqual(before.bitmapBounds);
  expect(frame.effectRuntimePlans[0]!.dimensions).toEqual(before.dimensions);
});
it.each(['title', 'callout', 'corners', 'frame'])(
  'keeps %s geometry and the current frame at fractional time',
  (name) => {
    const project = createProject(),
      document = replaceSnapshot(project, name),
      instance = project.effectInstances![0]!;
    if (document.objectLayout?.handles?.length)
      instance.sceneAnchors = { tip: { x: -100, y: -70 } };
    const host = project.clips.find((clip) => clip.id === 'standalone-host')!;
    host.transform = {
      ...host.transform,
      width: document.animation.w * 2,
      height: document.animation.h * 2,
      rotation: 23,
    };
    const plan = resolveEffectRuntimeFramePlans(project, 1.019)[0]!,
      bounds = resolveAnimationObjectRenderBounds(document, plan.controls);
    expect(plan.dimensions.width).toBeCloseTo(bounds.width, 7);
    expect(plan.dimensions.height).toBeCloseTo(bounds.height, 7);
    expect(plan.bitmapBounds).toEqual({
      x: bounds.x / document.animation.w,
      y: bounds.y / document.animation.h,
      width: bounds.width / document.animation.w,
      height: bounds.height / document.animation.h,
    });
    expect(plan.renderDimensions.width).toBeCloseTo(
      Math.floor((host.transform.width * bounds.width) / document.animation.w),
      0
    );
    expect(plan.renderDimensions.height).toBeCloseTo(
      Math.floor((host.transform.height * bounds.height) / document.animation.h),
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
  project.version = 52;
  const before = resolveEffectRuntimeFramePlans(project, 3.2);
  expect(before).toEqual([
    expect.objectContaining({ effectInstanceId: 'standalone-1', time: 2.9 }),
  ]);
  expect(resolveEffectRuntimeFramePlans(project, 3.3)).toEqual([]);
  const candidate: unknown = JSON.parse(JSON.stringify(project));
  expect(isHydratableVideoProject(candidate)).toBe(true);
  if (!isHydratableVideoProject(candidate)) throw new Error('Invalid supported reopen fixture');
  const reopened = hydrateVideoProject(candidate);
  expect(resolveEffectRuntimeFramePlans(reopened, 3.2)).toEqual([
    expect.objectContaining({ time: 2.9 }),
  ]);
});
it('changes physical extent and retains logical target and external bounds', async () => {
  const { applyEffectRuntimeRasterDimensions } = await import('./plan');
  const plan = resolveEffectRuntimeFramePlans(createProject(), 2.5)[0]!;
  const original = structuredClone(plan);
  const physical = applyEffectRuntimeRasterDimensions(plan, { width: 3200, height: 1800 });
  expect(physical.renderDimensions).toEqual({ width: 3200, height: 1800 });
  expect({ ...physical, renderDimensions: plan.renderDimensions }).toEqual(original);
  expect(plan).toEqual(original);
  expect(() =>
    applyEffectRuntimeRasterDimensions(plan, { width: 100_000, height: 100_000 })
  ).toThrow();
});
