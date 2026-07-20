import { describe, expect, it } from 'vitest';
import { createVideoProjectTrack } from '../../../../../features/video/project/factories/creation';
import { VideoTrackKind } from '../../../../../features/video/project/types';
import { resolveTrackInspectorControls } from './controls';

describe('track-controls', () => {
  it('shows grouped subtitle controls only for subtitle tracks', () => {
    const subtitleTrack = createVideoProjectTrack('Subtitles', 0, VideoTrackKind.SUBTITLE);
    const videoTrack = createVideoProjectTrack('Video', 1, VideoTrackKind.PRIMARY);

    expect(resolveTrackInspectorControls(subtitleTrack)).toEqual({
      canDeleteTrack: true,
      showGeneralGroup: true,
      showLayoutGroup: true,
      showPlacement: true,
      showSafeAreaPercent: true,
      showStyleGroup: true,
      showSubtitleFontSize: true,
      showSubtitleMaxWidthPercent: true,
      showSubtitlePadding: true,
    });
    expect(resolveTrackInspectorControls({ ...videoTrack, isRoot: true })).toEqual({
      canDeleteTrack: false,
      showGeneralGroup: true,
      showLayoutGroup: false,
      showPlacement: false,
      showSafeAreaPercent: false,
      showStyleGroup: false,
      showSubtitleFontSize: false,
      showSubtitleMaxWidthPercent: false,
      showSubtitlePadding: false,
    });
  });
});
