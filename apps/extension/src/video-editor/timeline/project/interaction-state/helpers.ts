import { translate } from '../../../../platform/i18n';
import { formatPreciseTime, formatTime } from '../../../contracts/time-format';

export { formatPreciseTime, formatTime };

export const TRACK_ROW_HEIGHT = 62;
export const EFFECT_LANE_ROW_HEIGHT = 46;
export const TELEMETRY_LANE_ROW_HEIGHT = 42;
export const RULER_HEIGHT = 30;

export function formatTimelineRulerLabel(value: number): string {
  return formatTime(Math.max(0, Math.floor(value)));
}

export function formatTimelineVisibleRange(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainderSeconds = Math.round(seconds % 60);
    if (remainderSeconds === 0) {
      return `${minutes} мин`;
    }

    return `${minutes} мин ${remainderSeconds} с`;
  }

  return `${Math.max(1, Math.round(seconds))} с`;
}

export function getTrackKindLabel(kind: string): string {
  switch (kind) {
    case 'PRIMARY':
      return translate('videoEditor.timeline.trackKindPrimary');
    case 'AUDIO':
      return translate('videoEditor.timeline.trackKindAudio');
    case 'OVERLAY':
      return translate('videoEditor.timeline.trackKindOverlay');
    case 'SUBTITLE':
      return translate('videoEditor.timeline.trackKindSubtitle');
    default:
      return kind;
  }
}
