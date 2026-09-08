import { translate } from '../../../../platform/i18n';
import { formatPreciseTime, formatTime } from '../../../contracts/time-format';

export { formatPreciseTime, formatTime };

export const TRACK_ROW_HEIGHT = 62;
export const EFFECT_LANE_ROW_HEIGHT = 46;
export const RULER_HEIGHT = 30;

export function formatTimelineRulerLabel(value: number, detailed = false): string {
  const milliseconds = detailed
    ? Math.max(0, Math.round(value * 1000))
    : Math.max(0, Math.floor(value) * 1000);
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const time =
    hours > 0
      ? `${hours}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
      : formatTime(seconds);
  return detailed ? `${time}.${String(milliseconds % 1000).padStart(3, '0')}` : time;
}

export function getTrackKindLabel(kind: string): string {
  switch (kind) {
    case 'PRIMARY':
      return translate('videoEditor.timeline.trackKindPrimary');
    case 'AUDIO':
      return translate('videoEditor.timeline.trackKindAudio');
    case 'SUBTITLE':
      return translate('videoEditor.timeline.trackKindSubtitle');
    default:
      return kind;
  }
}
