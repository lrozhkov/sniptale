import { expect, it } from 'vitest';
import { resolveEffectOwner } from './owner';
import {
  createProject,
  createTrack,
  createVideoClip,
  createAudioClip,
} from '../timeline/project-meta.test.helpers';

it('resolves clip ownership without granting audio, absent tracks or absent clips a visual owner', () => {
  const clip = createVideoClip({ startTime: 2, duration: 3, effectsBypassed: true });
  const project = createProject([clip, createAudioClip()]);
  expect(resolveEffectOwner(project, { kind: 'clip', clipId: clip.id })).toEqual({
    startTime: 2,
    duration: 3,
    locked: false,
    visible: true,
    bypassed: true,
  });
  for (const clipId of ['missing', 'clip-audio'])
    expect(resolveEffectOwner(project, { kind: 'clip', clipId })).toBeNull();
  expect(
    resolveEffectOwner({ ...project, tracks: [] }, { kind: 'clip', clipId: clip.id })
  ).toBeNull();
  expect(resolveEffectOwner(project, { kind: 'scene' })).toBeNull();
  expect(resolveEffectOwner(project, { kind: 'transition', transitionId: 'missing' })).toBeNull();
});
it('bounds track and video-group ownership to ordinary visual tracks and their visible intervals', () => {
  const video = createVideoClip({ startTime: 2, duration: 3 });
  const project = createProject([video]);
  const track = project.tracks.find((item) => item.id === video.trackId)!;
  track.effectsBypassed = true;
  track.locked = true;
  const camera = { ...createTrack('camera', -1), role: 'CAMERA' as const };
  project.tracks.push(camera);
  project.clips.push(createVideoClip({ id: 'camera-clip', trackId: camera.id, duration: 50 }));
  expect(resolveEffectOwner(project, { kind: 'track', trackId: track.id })).toEqual({
    startTime: 0,
    duration: 5,
    locked: true,
    visible: true,
    bypassed: true,
  });
  expect(resolveEffectOwner(project, { kind: 'track', trackId: camera.id })).toBeNull();
  expect(resolveEffectOwner(project, { kind: 'track', trackId: 'missing' })).toBeNull();
  project.videoEffectsBypassed = true;
  expect(resolveEffectOwner(project, { kind: 'video-group' })).toMatchObject({
    duration: 5,
    bypassed: true,
  });
  expect(
    resolveEffectOwner({ ...project, clips: [], tracks: [] }, { kind: 'video-group' })
  ).toEqual({ startTime: 0, duration: 0, locked: false, visible: false, bypassed: true });
});
