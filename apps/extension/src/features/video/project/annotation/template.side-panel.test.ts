import { expect, it } from 'vitest';
import { createEmptyVideoProject, createVideoProjectTrack } from '../factories/creation';
import { createAnnotationClip, resolveAnnotationPresentation } from './template';
import { VideoTrackKind, VideoOverlayTemplateKind, VideoTemplateDirection } from '../types/index';

it('resolves side reveal panels against the project edge by direction', () => {
  const project = createEmptyVideoProject('Templates', 1280, 720);
  project.tracks.push(createVideoProjectTrack('Annotations', 0, VideoTrackKind.PRIMARY));
  const clip = createAnnotationClip(
    project.tracks[1]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.SIDE_REVEAL_PANEL
  );

  clip.direction = VideoTemplateDirection.RIGHT;
  expect(resolveAnnotationPresentation(project, clip, 1).labelFrame).toEqual(
    expect.objectContaining({
      height: 720,
      width: 435,
      x: 845,
      y: 0,
    })
  );

  clip.direction = VideoTemplateDirection.LEFT;
  expect(resolveAnnotationPresentation(project, clip, 1).labelFrame.x).toBe(0);
});
