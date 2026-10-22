import { VIDEO_PROJECT_ATTACHMENT_GEOMETRY } from '../project/types/export';
import { resolveVideoCompositionFrame } from '../composition/timeline/frame';
import { resolveProjectRenderScope } from '../project/export/render-scope';
import { createScopeSettings } from '../project/export/render-scope.test-support';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { resolveEffectOwner } from '../project/effect-instance/owner';
import { isExportReadyVideoProject, parseHydratableVideoProject } from '../project/validation/root';
import { calculateProjectDuration, syncProjectDuration } from '../project/timeline/basics';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  sha256EffectV1Bytes,
  validateEffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
import { readReviewAnnotationEffectDocument } from './annotation-effects/validation';
import { planReviewProjectConversion } from './project-conversion';
import { fixture } from './project-conversion.test-support';
import { resolveEffectRuntimeFramePlans } from '../composition/effect-runtime/frame/plan';
import {
  sampleReviewAnnotationEffect,
  projectReviewAnnotationEffect,
} from './annotation-effects/timing';
import { buildReviewTimeMap } from './timeline';
import { hydrateVideoProject } from '../project/hydration';

async function annotationsFixture() {
  const input = fixture();
  const source = readFileSync(
    'apps/extension/public/video-effects/effects/annotations/sniptale-title/effect.sniptale-effect.json',
    'utf8'
  );
  const document = readReviewAnnotationEffectDocument(source)!;
  const sha256 = await sha256EffectV1Bytes(new TextEncoder().encode(source));
  const snapshot = {
    id: `effect:${sha256}`,
    sha256,
    source,
    documentId: document.id,
    schemaVersion: 'sniptale.effect.v1' as const,
    kind: 'standalone' as const,
    retainedByteLength: new TextEncoder().encode(source).byteLength,
    assets: [],
  };
  input.document.edits.push({
    id: 'speed',
    kind: 'speed',
    start: 4,
    end: 6,
    requestedStart: 4,
    requestedEnd: 6,
    rate: 2,
    audio: 'speed',
  });
  input.document.advancedContent.annotationEffects = {
    enabled: true,
    instances: ['content', 'viewport'].map((attachment, order) => ({
      id: attachment,
      snapshotId: snapshot.id,
      attachment: attachment === 'content' ? ('content' as const) : ('viewport' as const),
      enabled: true,
      start: 1,
      end: 7,
      transform: { x: 0.2, y: 0.3, width: 0.5, height: 0.2, rotation: 0.25 },
      controls: {},
      order,
    })),
  };
  return { ...input, annotationSnapshots: [snapshot] };
}

it('converts both annotation planes with Gallery phase through cuts speed and reopen', async () => {
  const input = await annotationsFixture();
  const before = structuredClone(input);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const project = hydrateVideoProject(result.project);
  const hosts = project.clips.filter((clip) => clip.type === 'EFFECT');
  expect(hosts).toHaveLength(2);
  expect(hosts.filter((clip) => clip.attachment?.kind === 'source')).toHaveLength(1);
  expect(hosts.filter((clip) => clip.attachment?.kind === 'viewport')).toHaveLength(1);
  expect(project.effectSnapshots).toHaveLength(1);
  const annotation = input.document.advancedContent.annotationEffects!.instances[0]!;
  const projection = projectReviewAnnotationEffect(
    annotation,
    buildReviewTimeMap(input.source.duration, input.document.edits)
  );
  for (const time of [1.019, 2.9, 3.25, 4.01, 4.9]) {
    const expected = sampleReviewAnnotationEffect(projection, 4, time)!;
    const plans = resolveEffectRuntimeFramePlans(project, time);
    expect(plans).toHaveLength(2);
    for (const plan of plans) {
      expect(plan.time).toBeCloseTo(expected.time, 7);
      expect(plan.progress).toBeCloseTo(expected.progress, 7);
    }
  }
  expect(input).toEqual(before);
});

it('refuses unavailable snapshots and retains wholly cut authored intervals without mutating the source', async () => {
  const input = await annotationsFixture();
  expect(planReviewProjectConversion({ ...input, annotationSnapshots: [] }).status).toBe('blocked');
  input.document.advancedContent.annotationEffects!.instances[0]!.start = 3;
  input.document.advancedContent.annotationEffects!.instances[0]!.end = 4;
  const before = structuredClone(input);
  expect(planReviewProjectConversion(input).status).toBe('prepared');
  expect(input).toEqual(before);
});

it('retains disabled annotations and a hidden lane without making their renderer active', async () => {
  const input = await annotationsFixture();
  input.document.advancedContent.annotationEffects!.enabled = false;
  input.ui.tracks.annotationEffects = false;
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.effectInstances).toHaveLength(2);
  expect(result.project.effectInstances!.every((entry) => entry.enabled)).toBe(true);
  expect(resolveEffectRuntimeFramePlans(result.project, 2)).toEqual([]);
  expect(
    result.project.tracks
      .filter((entry) => entry.id.includes(':annotation:'))
      .every((entry) => !entry.visible)
  ).toBe(true);
});

it('keeps ordinary Native effect clips as duration owners even on hidden tracks', async () => {
  const input = await annotationsFixture();
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const host = result.project.clips.find((clip) => clip.type === 'EFFECT')!;
  const project = {
    ...result.project,
    tracks: result.project.tracks.map((track) =>
      track.id === host.trackId ? { ...track, visible: false } : track
    ),
    clips: result.project.clips.map((clip) =>
      clip.id === host.id ? { ...clip, startTime: 20, duration: 6 } : clip
    ),
  };
  expect(calculateProjectDuration(project)).toBe(26);
});

it('retains wholly cut annotations without extending the montage after reopen', async () => {
  const input = await annotationsFixture();
  input.document.edits = [
    { id: 'all-annotation', kind: 'cut', start: 1, end: 7, requestedStart: 1, requestedEnd: 7 },
  ];
  const before = structuredClone(input);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const reopened = syncProjectDuration(hydrateVideoProject(result.project));
  expect(reopened.duration).toBe(2);
  expect(reopened.clips.filter((clip) => clip.type === 'EFFECT')).toHaveLength(2);
  for (const clip of reopened.clips.filter((clip) => clip.type === 'EFFECT')) {
    expect(clip).toMatchObject({
      sourceRange: {
        assetId: result.timeline.videoClips[0]!.assetId,
        sourceInstanceId: result.timeline.sourceInstanceId,
        start: 1,
        end: 7,
        dormant: true,
      },
    });
  }
  expect(reopened.effectSnapshots).toHaveLength(1);
  const targetSource = readFileSync(
    'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-target-effect.sniptale-effect.json',
    'utf8'
  );
  const targetDocument = validateEffectV1Document(JSON.parse(targetSource)).document!;
  const targetHash = await sha256EffectV1Bytes(new TextEncoder().encode(targetSource));
  const firstHost = reopened.clips.find((clip) => clip.type === 'EFFECT')!;
  expect(
    resolveEffectOwner(reopened, { kind: 'track', trackId: firstHost.trackId })!.duration
  ).toBe(0);
  reopened.effectSnapshots!.push({
    id: `effect:${targetHash}`,
    sha256: targetHash,
    source: targetSource,
    documentId: targetDocument.id,
    schemaVersion: 'sniptale.effect.v1',
    kind: 'targetEffect',
    assets: [],
    retainedByteLength: new TextEncoder().encode(targetSource).byteLength,
  });
  reopened.effectInstances!.push(
    ...[
      { kind: 'clip' as const, clipId: firstHost.id },
      { kind: 'track' as const, trackId: firstHost.trackId },
    ].map((target, index) => ({
      id: `dormant-fx-${index}`,
      snapshotId: `effect:${targetHash}`,
      kind: 'targetEffect' as const,
      target,
      controls: {},
      enabled: true,
      startTime: 1,
      duration: 1,
      playbackRate: 1,
    }))
  );
  expect(isExportReadyVideoProject(reopened)).toBe(true);
  expect(reopened.effectInstances!.every((instance) => instance.enabled)).toBe(true);
  for (const time of [0, 0.5, 1, 1.9])
    expect(resolveEffectRuntimeFramePlans(reopened, time)).toEqual([]);
  expect(input).toEqual(before);
});

it('exports selected source annotations with exact geometry and no unselected media', async () => {
  const input = await annotationsFixture();
  input.document.advancedContent.canvas = {
    width: 640,
    height: 360,
    crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  };
  input.document.advancedContent.windowHeader = {
    ...DEFAULT_WINDOW_HEADER,
    title: 'Selected annotation source',
  };
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const project = hydrateVideoProject(result.project);
  expect(isExportReadyVideoProject(project)).toBe(true);
  const original = structuredClone(project);
  const host = project.clips.find(
    (clip) => clip.type === 'EFFECT' && clip.attachment?.kind === 'source'
  )!;
  const scoped = resolveProjectRenderScope(
    project,
    createScopeSettings({
      scope: 'selected-clip',
      selectedClipIds: [host.id],
      width: project.width,
      height: project.height,
    })
  );
  expect(scoped.clips.map((clip) => clip.id)).toEqual([host.id]);
  expect(scoped.effectInstances?.map((instance) => instance.id)).toEqual([
    host.type === 'EFFECT' ? host.effectInstanceId : '',
  ]);
  for (const time of [1.019, 3.25, 4.9]) {
    const whole = resolveVideoCompositionFrame(project, time);
    const selected = resolveVideoCompositionFrame(scoped, time);
    const originalLayer = whole.visualLayers.find((layer) => layer.clipId === host.id);
    expect(originalLayer?.kind === 'effect' && originalLayer.sourceAttachment).toBeTruthy();
    expect(selected.visualLayers.map((layer) => layer.clipId)).toEqual([host.id]);
    const layer = selected.visualLayers[0]!;
    if (layer.kind !== 'effect' || originalLayer?.kind !== 'effect')
      throw new Error('Missing annotation layer');
    expect(layer.sourceAttachment?.mapping).toEqual(originalLayer.sourceAttachment?.mapping);
    expect(layer.sourceAttachment?.owner.clipId).toBe(originalLayer.sourceAttachment?.owner.clipId);
    expect(selected.camera).toEqual(whole.camera);
    expect(
      selected.effectRuntimePlans.map((plan) => ({ id: plan.effectInstanceId, time: plan.time }))
    ).toEqual(
      whole.effectRuntimePlans
        .filter(
          (plan) => plan.effectInstanceId === (host.type === 'EFFECT' ? host.effectInstanceId : '')
        )
        .map((plan) => ({ id: plan.effectInstanceId, time: plan.time }))
    );
  }
  expect(project).toEqual(original);
});

it('does not accept annotation geometry authority from an unknown imported JSON property', async () => {
  const result = planReviewProjectConversion(await annotationsFixture());
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const project = hydrateVideoProject(result.project);
  const imported = parseHydratableVideoProject(
    JSON.parse(
      JSON.stringify({
        ...project,
        attachmentGeometryProject: { ...project, clips: [] },
      })
    )
  );
  expect(imported).not.toBeNull();
  expect(JSON.stringify(imported)).toContain('"attachmentGeometryProject"');
  const before = resolveVideoCompositionFrame(project, 2);
  const after = resolveVideoCompositionFrame(imported!, 2);
  expect(after.visualLayers.map((layer) => layer.clipId)).toEqual(
    before.visualLayers.map((layer) => layer.clipId)
  );
  expect(after.camera).toEqual(before.camera);
  const host = project.clips.find(
    (clip) => clip.type === 'EFFECT' && clip.attachment?.kind === 'source'
  )!;
  const scoped = resolveProjectRenderScope(
    project,
    createScopeSettings({ scope: 'selected-clip', selectedClipIds: [host.id] })
  );
  expect(JSON.stringify(scoped)).not.toContain('"attachmentGeometryProject"');
  expect(structuredClone(scoped)[VIDEO_PROJECT_ATTACHMENT_GEOMETRY]).toBeUndefined();
});

it('retains dormant source annotations through bookend transfer and reopen', async () => {
  const input = await annotationsFixture();
  input.document.edits = [
    { id: 'all-annotation', kind: 'cut', start: 1, end: 7, requestedStart: 1, requestedEnd: 7 },
  ];
  const { createNeutralPresentationSettings } = await import('./advanced/presentation');
  const { createBookendImagePresentation } = await import('../project/scene/bookend-media');
  const { createVideoProjectAsset } = await import('../project/factories/creation');
  const settings = createNeutralPresentationSettings();
  settings.intro = {
    mode: 'image',
    image: {
      ...createBookendImagePresentation(),
      assetId: 'project-asset:card',
      width: 32,
      height: 16,
      duration: 1,
    },
  };
  input.document.advancedContent.presentation = settings;
  const asset = createVideoProjectAsset(
    'Card',
    'IMAGE',
    { kind: 'project-asset', projectAssetId: 'card' },
    {
      width: 32,
      height: 16,
      duration: null,
      hasAudio: false,
      audioPeaks: null,
      size: 100,
      mimeType: 'image/png',
    }
  );
  const before = structuredClone(input);
  const result = planReviewProjectConversion({
    ...input,
    bookendAssets: [{ reviewAssetId: 'project-asset:card', asset }],
  });
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const reopened = syncProjectDuration(
    hydrateVideoProject(JSON.parse(JSON.stringify(result.project)))
  );
  expect(reopened.duration).toBe(3);
  const hosts = reopened.clips.filter((clip) => clip.type === 'EFFECT');
  expect(hosts).toHaveLength(2);
  expect(
    hosts.every(
      (clip) =>
        clip.sourceRange?.dormant && clip.sourceRange.start === 1 && clip.sourceRange.end === 7
    )
  ).toBe(true);
  expect(reopened.effectSnapshots).toEqual(input.annotationSnapshots);
  const { planReviewProjectPresentation } = await import('./project-presentation');
  const activeOverhang = {
    ...reopened,
    clips: reopened.clips.map((clip) => {
      if (clip.type !== 'EFFECT') return clip;
      const { sourceRange: _sourceRange, ...active } = clip;
      return active;
    }),
  };
  expect(isExportReadyVideoProject(activeOverhang)).toBe(true);
  expect(
    planReviewProjectPresentation({
      project: activeOverhang,
      settings,
      applied: true,
      resources: [{ reviewAssetId: 'project-asset:card', asset }],
    })
  ).toEqual({ status: 'blocked', field: 'presentation-overlays' });
  expect(resolveEffectRuntimeFramePlans(reopened, 0.5)).toEqual([]);
  expect(resolveEffectRuntimeFramePlans(reopened, 1.5)).toEqual([]);
  expect(isExportReadyVideoProject(reopened)).toBe(true);
  expect(input).toEqual(before);
});
