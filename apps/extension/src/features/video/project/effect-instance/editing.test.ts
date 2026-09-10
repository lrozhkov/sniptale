import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { createVideoClip } from '../timeline/project-meta.test.helpers';
import { resizeClipEffectInterval, isEffectInstanceEditable } from './editing';
import { reconcileVideoProjectEffectInstances } from './reconcile';
import type { VideoProjectEffectInstance } from './types';
function fixture() {
  const project = createEmptyVideoProject('FX');
  const trackId = project.tracks[0]!.id;
  project.clips = [createVideoClip({ id: 'clip', trackId, startTime: 10, duration: 20 })];
  const instance: VideoProjectEffectInstance = {
    id: 'fx',
    snapshotId: 's',
    controls: {},
    enabled: true,
    kind: 'targetEffect',
    target: { kind: 'clip', clipId: 'clip' },
    startTime: 12,
    duration: 4,
    playbackRate: 0.5,
    sourceStart: 1,
  };
  project.effectInstances = [instance];
  return { project, instance };
}
it('bounds interval edits to the clip and preserves its retained source span', () => {
  const { project, instance } = fixture();
  const resized = resizeClipEffectInterval(project, instance, { startTime: 29, duration: 8 });
  expect(resized).toMatchObject({
    startTime: 22,
    duration: 8,
    playbackRate: 0.25,
    sourceStart: 1,
    rangeMode: 'interval',
  });
  expect(resizeClipEffectInterval(project, instance, { duration: NaN })).toBe(instance);
  expect(resizeClipEffectInterval(project, instance, { duration: 0 })).toBe(instance);
});
it('full-owner range follows a new clip length, retaining document phase', () => {
  const { project, instance } = fixture();
  project.effectInstances = [resizeClipEffectInterval(project, instance, { rangeMode: 'owner' })];
  project.clips[0]!.duration = 40;
  const next = reconcileVideoProjectEffectInstances(project).effectInstances![0]!;
  expect(next).toMatchObject({ startTime: 10, duration: 40, playbackRate: 0.05, sourceStart: 1 });
});
it('locks block edits and missing targets cannot be edited', () => {
  const { project, instance } = fixture();
  project.tracks[0]!.locked = true;
  expect(isEffectInstanceEditable(project, instance)).toBe(false);
  expect(resizeClipEffectInterval(project, instance, { startTime: 14 })).toBe(instance);
  project.clips = [];
  expect(isEffectInstanceEditable(project, instance)).toBe(false);
});

it('track and global ranges follow owner length but manual ranges remain at project time', () => {
  const { project, instance } = fixture();
  instance.target = { kind: 'track', trackId: project.tracks[0]!.id };
  instance.rangeMode = 'interval';
  project.clips[0]!.startTime = 20;
  expect(reconcileVideoProjectEffectInstances(project).effectInstances![0]).toMatchObject({
    startTime: 12,
    duration: 4,
  });
  project.effectInstances = [resizeClipEffectInterval(project, instance, { rangeMode: 'owner' })];
  expect(project.effectInstances[0]).toMatchObject({
    startTime: 0,
    duration: 40,
    playbackRate: 0.05,
  });
  project.clips[0]!.duration = 30;
  expect(reconcileVideoProjectEffectInstances(project).effectInstances![0]).toMatchObject({
    duration: 50,
    playbackRate: 0.04,
  });
  project.tracks[0]!.role = 'CAMERA';
  expect(reconcileVideoProjectEffectInstances(project).effectInstances).toEqual([]);
});
