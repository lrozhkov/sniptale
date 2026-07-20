import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createEmptyVideoProject } from '../../../project/factories/creation';
import { createEffectHostClip } from '../../../project/factories/overlay-clip';
import {
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
import { resolveEffectRuntimeFramePlans } from './plan';

describe('shared EffectV1 preview/export frame plan', () => {
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
  const trackId = project.tracks.find(({ kind }) => kind === 'OVERLAY')?.id;
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
