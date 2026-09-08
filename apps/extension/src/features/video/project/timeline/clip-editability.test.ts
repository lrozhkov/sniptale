import { expect, it } from 'vitest';
import { createProject, createVideoClip } from './project-meta.test.helpers';
import { VideoClipLinkMode } from '../types';
import { areProjectClipsEditable, canEditProjectClip } from './clip-editability';

it('requires every requested clip to exist on an unlocked track', () => {
  const project = createProject([createVideoClip()]);

  expect(areProjectClipsEditable(project, ['clip-video'])).toBe(true);
  expect(areProjectClipsEditable(project, ['missing'])).toBe(false);
  project.tracks.find((track) => track.id === 'track-video')!.locked = true;
  expect(areProjectClipsEditable(project, ['clip-video'])).toBe(false);
});

it('treats a locked linked counterpart as blocking the whole clip operation', () => {
  const project = createProject([createVideoClip()]);
  const video = project.clips[0]!;
  video.groupId = 'group-1';
  video.linkMode = VideoClipLinkMode.LINKED;
  const audioTrack = project.tracks[1]!;
  const counterpart = {
    ...video,
    id: 'linked-counterpart',
    trackId: audioTrack.id,
  };
  project.clips.push(counterpart);

  expect(canEditProjectClip(project, video.id)).toBe(true);
  audioTrack.locked = true;
  expect(canEditProjectClip(project, video.id)).toBe(false);
  expect(canEditProjectClip(project, 'missing')).toBe(false);
});
