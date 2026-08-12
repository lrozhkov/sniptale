import { expect, it } from 'vitest';
import { createVideoProjectTrack } from '../../../features/video/project/factories/creation';
import { VideoTrackKind } from '../../../features/video/project/types';
import { isVideoEditorPresentedTrack } from './presented-tracks';

it('keeps persisted subtitle tracks outside the editor presentation surface', () => {
  expect(
    isVideoEditorPresentedTrack(
      createVideoProjectTrack('Legacy subtitles', 1, VideoTrackKind.SUBTITLE)
    )
  ).toBe(false);
  expect(
    isVideoEditorPresentedTrack(createVideoProjectTrack('Video', 2, VideoTrackKind.PRIMARY))
  ).toBe(true);
});
