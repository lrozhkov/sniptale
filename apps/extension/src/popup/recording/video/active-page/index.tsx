import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import {
  ACTIVE_PANEL_CLASS_NAME,
  VideoActiveControls,
  VideoActiveDisplay,
  VideoActiveError,
  VideoActiveStatusHeader,
} from './surface';
import { useVideoActiveViewModel } from './view-model';

interface VideoActivePageProps {
  recordingState: VideoRecordingRuntimeState;
  onPauseResume: () => void;
  onStop: () => void;
}

export default function VideoActivePage({
  recordingState,
  onPauseResume,
  onStop,
}: VideoActivePageProps) {
  const viewModel = useVideoActiveViewModel(recordingState);

  return (
    <div className="flex h-full flex-col gap-3">
      <section className={ACTIVE_PANEL_CLASS_NAME}>
        <VideoActiveStatusHeader recordingState={recordingState} modeLabel={viewModel.modeLabel} />
        <VideoActiveDisplay
          recordingState={recordingState}
          value={viewModel.value}
          sourceLabel={viewModel.sourceLabel}
          viewportPresetLabel={viewModel.viewportPresetLabel}
        />
      </section>
      <VideoActiveError error={recordingState.error} />
      <VideoActiveControls
        recordingState={recordingState}
        isPaused={viewModel.isPaused}
        canControl={viewModel.canControl}
        isBusy={viewModel.isBusy}
        onPauseResume={onPauseResume}
        onStop={onStop}
      />
    </div>
  );
}
