import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { getRecordingStatusLabel } from '../../copy';
import { getVideoActiveIndicatorClassName } from '../helpers';
import {
  ACTIVE_BADGE_CLASS_NAME,
  ACTIVE_BADGE_SURFACE_CLASS_NAME,
  ACTIVE_BADGE_TEXT_CLASS_NAME,
  ACTIVE_MODE_PILL_CLASS_NAME,
  ACTIVE_MODE_PILL_SHADOW_CLASS_NAME,
  ACTIVE_MODE_PILL_SURFACE_CLASS_NAME,
} from '../styles';

export function VideoActiveStatusHeader({
  recordingState,
  modeLabel,
}: {
  recordingState: VideoRecordingRuntimeState;
  modeLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={[
          ACTIVE_BADGE_CLASS_NAME,
          ACTIVE_BADGE_SURFACE_CLASS_NAME,
          ACTIVE_BADGE_TEXT_CLASS_NAME,
        ].join(' ')}
      >
        <span
          className={`h-2 w-2 rounded-full ${getVideoActiveIndicatorClassName(recordingState.status)}`}
        />
        {getRecordingStatusLabel(recordingState.status)}
      </span>
      <span
        className={[
          ACTIVE_MODE_PILL_CLASS_NAME,
          ACTIVE_MODE_PILL_SURFACE_CLASS_NAME,
          ACTIVE_MODE_PILL_SHADOW_CLASS_NAME,
        ].join(' ')}
      >
        {modeLabel}
      </span>
    </div>
  );
}
