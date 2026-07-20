import { Loader2, Square } from 'lucide-react';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { getVideoActiveStopLabel } from '../helpers';
import {
  ACTIVE_SECONDARY_BUTTON_CLASS_NAME,
  ACTIVE_SECONDARY_BUTTON_HOVER_CLASS_NAME,
  ACTIVE_SECONDARY_BUTTON_SURFACE_CLASS_NAME,
  ACTIVE_SECONDARY_BUTTON_TEXT_CLASS_NAME,
} from '../styles';

export function VideoActiveStopControl({
  canControl,
  onStop,
  recordingState,
}: {
  canControl: boolean;
  onStop: () => void;
  recordingState: VideoRecordingRuntimeState;
}) {
  return (
    <button
      type="button"
      onClick={onStop}
      className={[
        ACTIVE_SECONDARY_BUTTON_CLASS_NAME,
        ACTIVE_SECONDARY_BUTTON_SURFACE_CLASS_NAME,
        ACTIVE_SECONDARY_BUTTON_TEXT_CLASS_NAME,
        ACTIVE_SECONDARY_BUTTON_HOVER_CLASS_NAME,
      ].join(' ')}
    >
      {recordingState.status === VideoRecordingStatus.STOPPING ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Square className="h-4 w-4" />
      )}
      {getVideoActiveStopLabel({ canControl, recordingState })}
    </button>
  );
}
