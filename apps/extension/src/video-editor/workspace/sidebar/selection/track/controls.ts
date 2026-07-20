import { VideoTrackKind } from '../../../../../features/video/project/types';
import type { VideoProjectTrack } from '../../../../../features/video/project/types';

export interface TrackInspectorControls {
  canDeleteTrack: boolean;
  showGeneralGroup: boolean;
  showLayoutGroup: boolean;
  showPlacement: boolean;
  showSafeAreaPercent: boolean;
  showStyleGroup: boolean;
  showSubtitleFontSize: boolean;
  showSubtitleMaxWidthPercent: boolean;
  showSubtitlePadding: boolean;
}

export function resolveTrackInspectorControls(
  track: Pick<VideoProjectTrack, 'isRoot' | 'kind' | 'subtitleStyle'>
): TrackInspectorControls {
  const supportsSubtitleStyle =
    track.kind === VideoTrackKind.SUBTITLE && track.subtitleStyle !== undefined;

  return {
    canDeleteTrack: !track.isRoot,
    showGeneralGroup: true,
    showLayoutGroup: supportsSubtitleStyle,
    showPlacement: supportsSubtitleStyle,
    showSafeAreaPercent: supportsSubtitleStyle,
    showStyleGroup: supportsSubtitleStyle,
    showSubtitleFontSize: supportsSubtitleStyle,
    showSubtitleMaxWidthPercent: supportsSubtitleStyle,
    showSubtitlePadding: supportsSubtitleStyle,
  };
}
