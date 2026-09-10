import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../project/factories/creation';
import { createVideoClip } from '../../../project/timeline/project-meta.test.helpers';
import type {
  VideoProjectEffectInstance,
  VideoProjectEffectTarget,
} from '../../../project/effect-instance/types';
import { resolveEffectRuntimeFrameTarget } from './target';
it('resolves only active ordinary video layers for scoped FX and respects missing, hidden and bypassed owners', () => {
  const project = createEmptyVideoProject('Scoped render');
  const track = project.tracks[0]!;
  project.tracks.push({ ...track, id: 'other' }, { ...track, id: 'camera', role: 'CAMERA' });
  project.clips = [
    createVideoClip({ id: 'first', trackId: track.id, startTime: 0, duration: 2 }),
    createVideoClip({ id: 'second', trackId: 'other', startTime: 0, duration: 2 }),
    createVideoClip({ id: 'camera', trackId: 'camera', startTime: 0, duration: 2 }),
  ];
  const resolve = (target: VideoProjectEffectTarget, time = 1) => {
    const instance: VideoProjectEffectInstance = {
      id: 'fx',
      kind: 'targetEffect',
      playbackRate: 1,
      snapshotId: 'snapshot',
      controls: {},
      startTime: 0,
      duration: 2,
      enabled: true,
      target,
    };
    return resolveEffectRuntimeFrameTarget(project, instance, [], time);
  };
  expect(resolve({ kind: 'track', trackId: track.id })).toEqual({
    kind: 'track',
    trackId: track.id,
    clipIds: ['first'],
  });
  expect(resolve({ kind: 'video-group' })).toEqual({
    kind: 'video-group',
    clipIds: ['first', 'second'],
  });
  expect(resolve({ kind: 'track', trackId: 'missing' })).toBeUndefined();
  expect(resolve({ kind: 'track', trackId: 'camera' })).toBeUndefined();
  expect(resolve({ kind: 'video-group' }, 3)).toBeNull();
  track.effectsBypassed = true;
  expect(resolve({ kind: 'track', trackId: track.id })).toBeNull();
  project.videoEffectsBypassed = true;
  expect(resolve({ kind: 'video-group' })).toBeNull();
  project.videoEffectsBypassed = false;
  track.visible = false;
  expect(resolve({ kind: 'track', trackId: track.id })).toBeNull();
  expect(resolve({ kind: 'video-group' })).toEqual({ kind: 'video-group', clipIds: ['second'] });
  project.tracks.find((t) => t.id === 'other')!.visible = false;
  expect(resolve({ kind: 'video-group' })).toBeNull();
});
