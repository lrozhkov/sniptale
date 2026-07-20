import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { useVideoActiveViewModel } from '../active-page/view-model';
import {
  VideoActiveMediaStatus,
  type VideoActiveMediaSelection,
} from '../active-page/media-status';
import {
  VideoActiveDisplay,
  VideoActiveError,
  VideoActiveStatusHeader,
} from '../active-page/surface';

const RECORDING_PANEL_CLASS_NAME = [
  'flex min-h-0 flex-1 flex-col rounded-[14px] border p-3.5',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_42%,transparent)]',
].join(' ');

export function VideoSetupRecordingPanel({
  mediaSelection,
  onActiveRecordingSettingsChange,
  recordingState,
}: {
  mediaSelection: VideoActiveMediaSelection;
  onActiveRecordingSettingsChange: (patch: Partial<VideoRecordingSettings>) => Promise<void>;
  recordingState: VideoRecordingRuntimeState;
}) {
  const viewModel = useVideoActiveViewModel(recordingState);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pr-1">
      <div className={RECORDING_PANEL_CLASS_NAME}>
        <VideoActiveStatusHeader recordingState={recordingState} modeLabel={viewModel.modeLabel} />
        <div className="min-h-0 flex-1">
          <VideoActiveDisplay
            recordingState={recordingState}
            value={viewModel.value}
            sourceLabel={viewModel.sourceLabel}
            viewportPresetLabel={viewModel.viewportPresetLabel}
          />
          <VideoActiveMediaStatus
            selection={mediaSelection}
            onActiveRecordingSettingsChange={onActiveRecordingSettingsChange}
          />
        </div>
      </div>
      <VideoActiveError error={recordingState.error} />
    </div>
  );
}
