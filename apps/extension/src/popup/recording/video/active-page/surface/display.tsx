import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { getVideoActiveValueClassName } from '../helpers';
import {
  ACTIVE_PRESET_PILL_CLASS_NAME,
  ACTIVE_PRESET_PILL_SURFACE_CLASS_NAME,
  ACTIVE_PRESET_PILL_TEXT_CLASS_NAME,
} from '../styles';

export function VideoActiveDisplay({
  recordingState,
  value,
  sourceLabel,
  viewportPresetLabel,
}: {
  recordingState: VideoRecordingRuntimeState;
  value: string;
  sourceLabel: string;
  viewportPresetLabel: string | null;
}) {
  return (
    <div className="flex min-h-[132px] flex-col items-center justify-start pt-7 text-center">
      <div
        className={`text-5xl font-semibold tabular-nums ${getVideoActiveValueClassName(recordingState.status)}`}
      >
        {value}
      </div>
      <div className="mt-4 max-w-full truncate text-sm font-medium text-[var(--sniptale-color-text-primary)]">
        {sourceLabel}
      </div>
      {viewportPresetLabel ? (
        <span
          className={[
            ACTIVE_PRESET_PILL_CLASS_NAME,
            ACTIVE_PRESET_PILL_SURFACE_CLASS_NAME,
            ACTIVE_PRESET_PILL_TEXT_CLASS_NAME,
          ].join(' ')}
        >
          {viewportPresetLabel}
        </span>
      ) : null}
    </div>
  );
}
