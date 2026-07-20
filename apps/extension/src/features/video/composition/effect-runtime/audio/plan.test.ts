import { expect, it } from 'vitest';

import { VideoProjectClipType } from '../../../project/types/index';
import {
  convertToTargetEffect,
  convertToTransitionEffect,
  createAudioProject,
  restoreValidAudioSnapshot,
  updateDocument,
} from './test-support';
import { EffectRuntimeAudioPlanError, resolveEffectRuntimeAudioPlans } from './plan';
const AUDIO_SHA = '0'.repeat(64);

it('maps EffectV1 clip timing, offset, volume, and playback rate into one shared audio plan', () => {
  const project = createAudioProject();

  expect(resolveEffectRuntimeAudioPlans(project)).toEqual([
    expect.objectContaining({
      assetCacheKey: `snapshot-1:tone:${AUDIO_SHA}`,
      duration: 0.5,
      effectInstanceId: 'effect-1',
      playbackRate: 2,
      sourceDuration: 1,
      sourceKind: 'effect-snapshot',
      sourceStart: 0.25,
      startTime: 2.25,
      volume: 0.4,
    }),
  ]);
});

it('honors instance, layer, clip, and scene visibility without an audio fallback', () => {
  const project = createAudioProject();
  project.effectInstances![0]!.enabled = false;
  expect(resolveEffectRuntimeAudioPlans(project)).toEqual([]);

  project.effectInstances![0]!.enabled = true;
  updateDocument(project, (document) => {
    document.layers.find(({ id }) => id === 'audio')!.visible = false;
  });
  expect(resolveEffectRuntimeAudioPlans(project)).toEqual([]);

  updateDocument(project, (document) => {
    document.layers.find(({ id }) => id === 'audio')!.visible = true;
    document.clips.find(({ layerId }) => layerId === 'audio')!.enabled = false;
  });
  expect(resolveEffectRuntimeAudioPlans(project)).toEqual([]);

  updateDocument(project, (document) => {
    document.clips.find(({ layerId }) => layerId === 'audio')!.enabled = true;
    document.scenes[0]!.enabled = false;
  });
  expect(resolveEffectRuntimeAudioPlans(project)).toEqual([]);
});

it('uses the ordinary standalone host clip as the visual and audio availability authority', () => {
  const project = createAudioProject();
  const host = project.clips.find(({ type }) => type === VideoProjectClipType.EFFECT)!;
  const hostTrack = project.tracks.find(({ id }) => id === host.trackId)!;

  hostTrack.visible = false;
  expect(resolveEffectRuntimeAudioPlans(project)).toEqual([]);
  hostTrack.visible = true;
  project.clips = project.clips.filter(({ id }) => id !== host.id);
  expect(() => resolveEffectRuntimeAudioPlans(project)).toThrow(
    expect.objectContaining({ code: 'effectAudioTargetFailure' })
  );
});

it('accepts fractional resize timing within the shared EffectV1 epsilon', () => {
  const project = createAudioProject();
  const instance = project.effectInstances![0]!;
  const host = project.clips.find(({ type }) => type === VideoProjectClipType.EFFECT)!;
  instance.duration = 0.7;
  instance.playbackRate = 3 / 0.7;
  host.duration = 0.7;

  expect(() => resolveEffectRuntimeAudioPlans(project)).not.toThrow();
});

it('treats an audio layer without clips as active for the whole document', () => {
  const project = createAudioProject();
  updateDocument(project, (document) => {
    document.clips = document.clips.filter(({ layerId }) => layerId !== 'audio');
  });

  expect(resolveEffectRuntimeAudioPlans(project)).toEqual([
    expect.objectContaining({
      duration: 1.5,
      sourceDuration: 3,
      sourceStart: 0,
      startTime: 2,
    }),
  ]);
});

it('fails closed when a retained snapshot asset no longer matches the declared bytes', () => {
  const project = createAudioProject();
  project.effectSnapshots![0]!.assets[0]!.byteLength = 5;

  expect(() => resolveEffectRuntimeAudioPlans(project)).toThrow(EffectRuntimeAudioPlanError);
});

it('intersects target-effect audio with the visible owning clip interval', () => {
  const project = createAudioProject();
  convertToTargetEffect(project);

  expect(resolveEffectRuntimeAudioPlans(project)).toEqual([]);
  project.effectInstances![0]!.startTime = 1.5;
  expect(resolveEffectRuntimeAudioPlans(project)).toEqual([
    expect.objectContaining({
      duration: 0.25,
      sourceDuration: 0.5,
      sourceStart: 0.25,
      startTime: 1.75,
    }),
  ]);
  project.tracks[0]!.visible = false;
  expect(resolveEffectRuntimeAudioPlans(project)).toEqual([]);
  project.tracks[0]!.visible = true;
  project.effectInstances![0]!.target = { clipId: 'missing', kind: 'clip' };
  expect(() => resolveEffectRuntimeAudioPlans(project)).toThrow(
    expect.objectContaining({ code: 'effectAudioTargetFailure' })
  );
});

it('uses both transition tracks as the shared visual and audio availability authority', () => {
  const project = createAudioProject();
  convertToTransitionEffect(project);

  expect(resolveEffectRuntimeAudioPlans(project)).not.toEqual([]);
  project.tracks[0]!.visible = false;
  expect(resolveEffectRuntimeAudioPlans(project)).toEqual([]);
});

it('fails closed for missing snapshots, kind drift, invalid source, and duration drift', () => {
  const project = createAudioProject();
  project.effectInstances![0]!.snapshotId = 'missing';
  expect(() => resolveEffectRuntimeAudioPlans(project)).toThrow(EffectRuntimeAudioPlanError);

  project.effectInstances![0]!.snapshotId = 'snapshot-1';
  project.effectSnapshots![0]!.kind = 'transition';
  expect(() => resolveEffectRuntimeAudioPlans(project)).toThrow(EffectRuntimeAudioPlanError);

  project.effectSnapshots![0]!.kind = 'standalone';
  project.effectSnapshots![0]!.source = '{';
  expect(() => resolveEffectRuntimeAudioPlans(project)).toThrow(EffectRuntimeAudioPlanError);

  restoreValidAudioSnapshot(project);
  project.effectInstances![0]!.duration = 1;
  expect(() => resolveEffectRuntimeAudioPlans(project)).toThrow(EffectRuntimeAudioPlanError);
});

it('clamps authored audio volume to the supported unit interval', () => {
  const project = createAudioProject();
  updateDocument(project, (document) => {
    document.layers.find(({ id }) => id === 'audio')!['volume'] = 2;
  });

  expect(resolveEffectRuntimeAudioPlans(project)[0]!.volume).toBe(1);
});
