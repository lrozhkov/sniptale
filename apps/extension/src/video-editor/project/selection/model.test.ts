import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import {
  createSubtitleClip,
  createTextClip,
} from '../../../features/video/project/factories/overlay-clip';
import { VideoTrackKind } from '../../../features/video/project/types';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import { resolveInitialVideoEditorSelection } from './model';

it('skips a persisted subtitle-first clip when choosing the initial selection', () => {
  const project = createEmptyVideoProject('Legacy subtitles');
  const subtitleTrack = createVideoProjectTrack('Subtitles', 4, VideoTrackKind.SUBTITLE);
  const overlayTrack = project.tracks.find((track) => track.kind === VideoTrackKind.OVERLAY)!;
  const subtitleClip = createSubtitleClip(subtitleTrack.id, project.width, project.height, 0);
  const textClip = createTextClip(overlayTrack.id, project.width, project.height, 0);
  project.tracks.push(subtitleTrack);
  project.clips = [subtitleClip, textClip];

  expect(resolveInitialVideoEditorSelection(project)).toEqual({
    clipId: textClip.id,
    kind: VideoEditorSelectionKind.CLIP,
  });
});
