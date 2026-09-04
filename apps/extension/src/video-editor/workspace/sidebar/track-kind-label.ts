import { translate } from '../../../platform/i18n';
import {
  VideoTrackKind,
  type VideoTrackKind as VideoTrackKindValue,
} from '../../../features/video/project/types';

export function getVideoTrackKindLabel(kind: VideoTrackKindValue): string {
  switch (kind) {
    case VideoTrackKind.PRIMARY:
      return translate('videoEditor.timeline.trackKindPrimary');
    case VideoTrackKind.AUDIO:
      return translate('videoEditor.timeline.trackKindAudio');
    case VideoTrackKind.OVERLAY:
      return translate('videoEditor.timeline.trackKindOverlay');
    case VideoTrackKind.SUBTITLE:
      return translate('videoEditor.timeline.trackKindSubtitle');
  }
}
