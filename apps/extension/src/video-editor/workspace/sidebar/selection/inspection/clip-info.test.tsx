import { VideoTrackKind } from '../../../../../features/video/project/types';
import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../../../features/video/project/factories/creation';
import { createTextClip } from '../../../../../features/video/project/factories/overlay-clip';
import { resolveClipAsset } from './clip-info';

it('does not resolve media assets for generated text clips', () => {
  const project = createEmptyVideoProject('Clip info');
  project.tracks.push(createVideoProjectTrack('Annotations', 0, VideoTrackKind.OVERLAY));
  const textClip = createTextClip(project.tracks[1]!.id, project.width, project.height, 0);

  expect(resolveClipAsset(project, textClip)).toBeNull();
});
