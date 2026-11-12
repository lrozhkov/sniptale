import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { animationRuntimeDuration } from '../../../../contracts/effect-runtime/animation';
import { createGlTransitionSelection } from '../transition/gl-catalog';
import { buildProjectTransitionSegments } from '../transition/project';
import { resolveEffectRuntimeFramePlans } from '../../composition/effect-runtime/frame/plan';
import { createEmptyVideoProject, createVideoProjectTrack } from '../factories/creation';
import { createRecordingBaseClip, createRecordingProjectAsset } from '../factories/recording';
import { createEffectHostClip } from '../factories/overlay-clip';
import { syncProjectDuration } from '../timeline/basics';
import { VideoTrackKind, VideoTransitionEasing, type VideoProject } from '../types';
import { isHydratableVideoProject } from '../validation';
import type { VideoProjectEffectInstance, VideoProjectEffectSnapshot } from './types';

function createProjectWithEffects(): VideoProject {
  const project = createEmptyVideoProject('Animation reconciliation');
  project.version = 52;
  const { asset, leading, trailing } = createRecordingFixture(project);
  const track = createVideoProjectTrack('Annotations', -1, VideoTrackKind.PRIMARY);
  project.tracks.push(track);
  const definitions = ['title', 'frame'].map((name) => {
    const source = readFileSync(
      `apps/extension/public/video-effects/animations/${name}.sniptale-animation.json`,
      'utf8'
    );
    const parsed = parseAnimationTemplateSource(source);
    if (!parsed.ok) throw new Error('Expected valid animation.');
    const sha256 = createHash('sha256').update(source).digest('hex');
    const snapshot: VideoProjectEffectSnapshot = {
      source,
      sha256,
      id: `effect:${sha256}`,
      documentId: parsed.template.id,
      kind: 'standalone',
      schemaVersion: 'sniptale.animation.v1',
      assets: [],
      retainedByteLength: Buffer.byteLength(source),
    };
    return { snapshot, document: parsed.template };
  });
  const effectInstances: VideoProjectEffectInstance[] = definitions.map(
    ({ snapshot, document }, index) => ({
      id: index === 0 ? 'scene' : 'other',
      snapshotId: snapshot.id,
      kind: 'standalone',
      target: { kind: 'scene' },
      duration: animationRuntimeDuration(document),
      playbackRate: 1,
      enabled: true,
      startTime: index * 4,
      controls: Object.fromEntries(
        document.controls.map((control) => [control.id, control.defaultValue])
      ),
    })
  );
  return {
    ...project,
    assets: [asset],
    duration: 9,
    effectSnapshots: definitions.map((entry) => entry.snapshot),
    effectInstances,
    clips: [
      leading,
      trailing,
      ...effectInstances.map((instance) =>
        createEffectHostClip({
          duration: instance.duration,
          effectInstanceId: instance.id,
          name: instance.id,
          projectWidth: project.width,
          projectHeight: project.height,
          startTime: instance.startTime,
          trackId: track.id,
        })
      ),
    ],
    transitions: [
      {
        duration: 1,
        easing: VideoTransitionEasing.LINEAR,
        id: 'transition-id',
        kind: 'gl',
        selection: createGlTransitionSelection('Fade')!,
        leadingClipId: leading.id,
        trailingClipId: trailing.id,
      },
    ],
  };
}

function createRecordingFixture(project: VideoProject) {
  const asset = createRecordingProjectAsset({
    duration: 9,
    filename: 'recording.webm',
    height: 720,
    mimeType: 'video/webm',
    recordingId: 'recording',
    size: 1,
    width: 1280,
  });
  const trackId = project.tracks[0]!.id;
  const geometry = { duration: 5, height: 720, width: 1280 };
  const leading = createRecordingBaseClip(asset, geometry, trackId, null);
  const trailing = createRecordingBaseClip(asset, geometry, trackId, null);
  trailing.startTime = 4;
  return { asset, leading, trailing };
}

describe('animation project mutation reconciliation', () => {
  it('recomputes the GL boundary without retiming independent scene annotations', () => {
    const project = createProjectWithEffects(),
      original = structuredClone(project);
    const trailingClipId = project.transitions![0]!.trailingClipId;
    const reconciled = syncProjectDuration({
      ...project,
      clips: project.clips.map((clip) =>
        clip.id === trailingClipId ? { ...clip, startTime: 4.3 } : clip
      ),
    });
    const [segment] = buildProjectTransitionSegments(reconciled);
    expect(segment?.start).toBeCloseTo(4.3);
    expect(segment?.end).toBeCloseTo(5);
    expect(reconciled.transitions![0]!.duration).toBeCloseTo(0.7);
    expect(reconciled.effectInstances).toEqual(project.effectInstances);
    expect(isHydratableVideoProject(reconciled)).toBe(true);
    const [plan] = resolveEffectRuntimeFramePlans(reconciled, 4.65);
    expect(plan?.effectInstanceId).toBe('other');
    expect(plan?.progress).toBeCloseTo(0.65 / 3);
    expect(project).toEqual(original);
  });
  it('prunes a deleted annotation host and its unreferenced snapshot atomically', () => {
    const project = createProjectWithEffects(),
      leadingClipId = project.transitions![0]!.leadingClipId;
    const reconciled = syncProjectDuration({
      ...project,
      clips: project.clips.filter(
        (clip) =>
          clip.id !== leadingClipId &&
          !(clip.type === 'EFFECT' && clip.effectInstanceId === 'other')
      ),
    });
    expect(reconciled.transitions).toEqual([]);
    expect(reconciled.effectInstances?.map((entry) => entry.id)).toEqual(['scene']);
    expect(reconciled.effectSnapshots?.map((entry) => entry.id)).toEqual([
      reconciled.effectInstances![0]!.snapshotId,
    ]);
    expect(isHydratableVideoProject(reconciled)).toBe(true);
    expect(resolveEffectRuntimeFramePlans(reconciled, 1)).toEqual([
      expect.objectContaining({ effectInstanceId: 'scene' }),
    ]);
  });
});

it('keeps the retained document interval when a windowed annotation placement changes', () => {
  const project = createProjectWithEffects(),
    scene = project.effectInstances![0]!,
    original = structuredClone(scene);
  const host = project.clips.find(
    (clip) => clip.type === 'EFFECT' && clip.effectInstanceId === scene.id
  )!;
  host.duration += 0.3;
  host.playbackWindow = { offset: 0, holdAt: scene.duration - 0.1 };
  const next = syncProjectDuration(project);
  expect(next.effectInstances!.find((entry) => entry.id === scene.id)).toEqual(original);
  expect(isHydratableVideoProject(next)).toBe(true);
});
it.each(['motion', 'background'])('retains normalized animation inputs after a %s edit', (kind) => {
  const project = syncProjectDuration(createProjectWithEffects()),
    before = structuredClone(project);
  const edited =
    kind === 'motion'
      ? { ...project, motionRegions: [] }
      : { ...project, sceneBackground: { kind: 'solid' as const, color: '#123456' } };
  const next = syncProjectDuration(edited);
  expect(next.clips).toBe(project.clips);
  expect(next.effectInstances).toBe(project.effectInstances);
  expect(next.effectSnapshots).toBe(project.effectSnapshots);
  expect(project).toEqual(before);
});
