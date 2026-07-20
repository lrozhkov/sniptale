import { expect, it } from 'vitest';
import { VideoProjectClipType } from '../../../../features/video/project/types';
import { createProjectWithMediaTrack, getAnnotationClipId } from './content.test-support';

it('creates a media project fixture with overlay and primary clips', () => {
  const project = createProjectWithMediaTrack();

  expect(project.assets).toHaveLength(2);
  expect(project.clips.map((clip) => clip.type)).toEqual([
    VideoProjectClipType.VIDEO,
    VideoProjectClipType.IMAGE,
    VideoProjectClipType.ANNOTATION,
    VideoProjectClipType.TEXT,
  ]);
  expect(getAnnotationClipId(project)).toBe(project.clips[2]!.id);
});

it('throws when the fixture project does not contain an annotation clip', () => {
  expect(() =>
    getAnnotationClipId({
      ...createProjectWithMediaTrack(),
      clips: [],
    })
  ).toThrow('Expected annotation clip fixture');
});
