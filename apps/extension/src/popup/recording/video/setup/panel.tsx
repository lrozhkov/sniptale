import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { useVideoActiveViewModel } from '../active-page/view-model';
import { VideoCountdownReadiness } from '../active-page/countdown-readiness';
import { translate } from '../../../../platform/i18n/popup';
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
  activeRecordingId,
  mediaSelection,
  onActiveRecordingSettingsChange,
  recordingState,
}: {
  activeRecordingId?: string | null;
  mediaSelection: VideoActiveMediaSelection;
  onActiveRecordingSettingsChange: (patch: Partial<VideoRecordingSettings>) => Promise<void>;
  recordingState: VideoRecordingRuntimeState;
}) {
  const viewModel = useVideoActiveViewModel(recordingState);
  const isCountdown = recordingState.status === VideoRecordingStatus.COUNTDOWN;
  const showReadiness =
    isCountdown && (mediaSelection.microphoneEnabled || mediaSelection.webcamEnabled);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pr-1">
      <div className={RECORDING_PANEL_CLASS_NAME}>
        <VideoActiveStatusHeader recordingState={recordingState} modeLabel={viewModel.modeLabel} />
        <div className="min-h-0 flex-1">
          <div className={showReadiness ? 'grid grid-cols-[minmax(0,1fr)_112px] gap-3' : undefined}>
            <VideoActiveDisplay
              recordingState={recordingState}
              value={viewModel.value}
              sourceLabel={viewModel.sourceLabel}
              viewportPresetLabel={viewModel.viewportPresetLabel}
            />
            {showReadiness ? (
              <VideoCountdownReadiness
                activeRecordingId={activeRecordingId ?? null}
                recordingState={recordingState}
                selection={mediaSelection}
              />
            ) : null}
          </div>
          <VideoActiveMediaStatus
            recordingState={recordingState}
            selection={mediaSelection}
            onActiveRecordingSettingsChange={onActiveRecordingSettingsChange}
          />
          {isCountdown ? (
            <p className="mt-2 px-3 text-[11px] text-[var(--sniptale-color-text-muted-strong)]">
              {translate('popup.video.countdownMediaReadOnly')}
            </p>
          ) : null}
        </div>
      </div>
      <VideoActiveError error={recordingState.error} />
    </div>
  );
}
