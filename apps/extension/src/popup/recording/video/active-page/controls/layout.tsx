import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { VideoActiveIdleState } from './idle-state';
import { VideoActivePrimaryControl } from './primary-control';
import { VideoActiveStopControl } from './stop-control';

export function VideoActiveControls({
  recordingState,
  isPaused,
  canControl,
  isBusy,
  onPauseResume,
  onStop,
}: {
  recordingState: VideoRecordingRuntimeState;
  isPaused: boolean;
  canControl: boolean;
  isBusy: boolean;
  onPauseResume: () => void;
  onStop: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {canControl ? (
        <VideoActivePrimaryControl isPaused={isPaused} onPauseResume={onPauseResume} />
      ) : (
        <VideoActiveIdleState isBusy={isBusy} />
      )}
      <VideoActiveStopControl
        canControl={canControl}
        onStop={onStop}
        recordingState={recordingState}
      />
    </div>
  );
}
