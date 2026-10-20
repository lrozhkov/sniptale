import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useState } from 'react';
import { translate, type TranslationKey } from '../../../../platform/i18n/popup';
import type {
  VideoRecordingRuntimeState,
  VideoRecordingSettings,
  WebcamActualSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { formatKnownWebcamActualSettings } from '../webcam-actual-settings';

export interface VideoActiveMediaSelection {
  microphoneDeviceId: string | null;
  microphoneEnabled: boolean;
  microphoneSelected: boolean;
  microphoneLabel: string | null;
  webcamDeviceId: string | null;
  webcamEnabled: boolean;
  webcamSelected: boolean;
  webcamSettings: WebcamActualSettings | null;
  webcamLabel: string | null;
}

const ROW_CLASS_NAME = 'grid min-w-0 grid-cols-[28px_minmax(0,1fr)_28px] items-center gap-2';
const MICROPHONE_ROW_CLASS_NAME = 'grid min-w-0 grid-cols-[28px_minmax(0,1fr)] items-center gap-2';
const STATUS_ROW_CLASS_NAME = 'grid min-w-0 grid-cols-[28px_minmax(0,1fr)] items-center gap-2';
const LABEL_CLASS_NAME = 'truncate text-[11px] text-[var(--sniptale-color-text-muted-strong)]';
const VALUE_CLASS_NAME = 'truncate text-xs font-medium text-[var(--sniptale-color-text-primary)]';
const STATUS_TEXT_CLASS_NAME = 'truncate text-xs text-[var(--sniptale-color-text-muted-strong)]';

function resolveSelectedName(label: string | null, fallbackKey: TranslationKey): string {
  const trimmed = label?.trim();
  return trimmed || translate(fallbackKey);
}

function MicrophoneStatus({
  readOnly,
  onActiveRecordingSettingsChange,
  selection,
}: {
  readOnly: boolean;
  onActiveRecordingSettingsChange: (patch: Partial<VideoRecordingSettings>) => Promise<void>;
  selection: VideoActiveMediaSelection;
}) {
  if (!selection.microphoneSelected) {
    return <InactiveMicrophoneStatus />;
  }

  return (
    <ActiveMicrophoneStatus
      readOnly={readOnly}
      selection={selection}
      onActiveRecordingSettingsChange={onActiveRecordingSettingsChange}
    />
  );
}

function InactiveMicrophoneStatus() {
  const statusText = translate('popup.video.activeMicrophoneNotRecorded');
  return (
    <div className={STATUS_ROW_CLASS_NAME}>
      <MicOff className="h-4 w-4 justify-self-center text-[var(--sniptale-color-text-muted-strong)]" />
      <div className="min-w-0">
        <div className={LABEL_CLASS_NAME}>{translate('popup.video.activeMicrophoneLabel')}</div>
        <div className={STATUS_TEXT_CLASS_NAME} title={statusText}>
          {statusText}
        </div>
      </div>
    </div>
  );
}

function ActiveMicrophoneStatus({
  readOnly,
  onActiveRecordingSettingsChange,
  selection,
}: {
  readOnly: boolean;
  onActiveRecordingSettingsChange: (patch: Partial<VideoRecordingSettings>) => Promise<void>;
  selection: VideoActiveMediaSelection;
}) {
  const selectedName = resolveSelectedName(
    selection.microphoneLabel,
    'popup.video.activeMicrophoneNotSelected'
  );

  return (
    <div className={MICROPHONE_ROW_CLASS_NAME}>
      <ActiveMediaMuteButton
        readOnly={readOnly}
        enabled={selection.microphoneEnabled}
        labelWhenEnabled={translate('popup.video.activeMicrophoneMute')}
        labelWhenMuted={translate('popup.video.activeMicrophoneUnmute')}
        onToggle={() =>
          onActiveRecordingSettingsChange({ microphoneEnabled: !selection.microphoneEnabled })
        }
        type="microphone"
      />
      <div className="min-w-0">
        <div className={LABEL_CLASS_NAME}>{translate('popup.video.activeMicrophoneLabel')}</div>
        <div className={VALUE_CLASS_NAME} title={selectedName}>
          {selectedName}
        </div>
      </div>
    </div>
  );
}

function WebcamStatus({
  readOnly,
  onActiveRecordingSettingsChange,
  selection,
}: {
  readOnly: boolean;
  onActiveRecordingSettingsChange: (patch: Partial<VideoRecordingSettings>) => Promise<void>;
  selection: VideoActiveMediaSelection;
}) {
  if (!selection.webcamSelected) {
    return <InactiveWebcamStatus />;
  }

  return (
    <ActiveWebcamStatus
      readOnly={readOnly}
      selection={selection}
      onActiveRecordingSettingsChange={onActiveRecordingSettingsChange}
    />
  );
}

function InactiveWebcamStatus() {
  const statusText = translate('popup.video.activeWebcamNotRecorded');
  return (
    <div className={STATUS_ROW_CLASS_NAME}>
      <VideoOff className="h-4 w-4 justify-self-center text-[var(--sniptale-color-text-muted-strong)]" />
      <div className="min-w-0">
        <div className={LABEL_CLASS_NAME}>{translate('popup.video.activeWebcamLabel')}</div>
        <div className={STATUS_TEXT_CLASS_NAME} title={statusText}>
          {statusText}
        </div>
      </div>
    </div>
  );
}

function ActiveWebcamStatus({
  readOnly,
  onActiveRecordingSettingsChange,
  selection,
}: {
  readOnly: boolean;
  onActiveRecordingSettingsChange: (patch: Partial<VideoRecordingSettings>) => Promise<void>;
  selection: VideoActiveMediaSelection;
}) {
  const selectedName = resolveSelectedName(
    selection.webcamLabel,
    'popup.video.activeWebcamNotSelected'
  );
  const actualSettings = formatKnownWebcamActualSettings(selection.webcamSettings);

  return (
    <div className={ROW_CLASS_NAME}>
      {selection.webcamEnabled ? (
        <Video className="h-4 w-4 justify-self-center text-[var(--sniptale-color-text-muted-strong)]" />
      ) : (
        <VideoOff className="h-4 w-4 justify-self-center text-[var(--sniptale-color-text-muted-strong)]" />
      )}
      <div className="min-w-0">
        <div className={LABEL_CLASS_NAME}>{translate('popup.video.activeWebcamLabel')}</div>
        <div className={VALUE_CLASS_NAME} title={selectedName}>
          {selectedName}
        </div>
        {actualSettings ? (
          <div className={STATUS_TEXT_CLASS_NAME} title={actualSettings}>
            {actualSettings}
          </div>
        ) : null}
      </div>
      <ActiveMediaMuteButton
        readOnly={readOnly}
        enabled={selection.webcamEnabled}
        labelWhenEnabled={translate('popup.video.activeWebcamMute')}
        labelWhenMuted={translate('popup.video.activeWebcamUnmute')}
        onToggle={() =>
          onActiveRecordingSettingsChange({ webcamEnabled: !selection.webcamEnabled })
        }
        type="webcam"
      />
    </div>
  );
}

export function VideoActiveMediaStatus({
  recordingState,
  onActiveRecordingSettingsChange,
  selection,
}: {
  recordingState?: VideoRecordingRuntimeState;
  onActiveRecordingSettingsChange: (patch: Partial<VideoRecordingSettings>) => Promise<void>;
  selection: VideoActiveMediaSelection;
}) {
  const readOnly = recordingState?.status === VideoRecordingStatus.COUNTDOWN;
  const showSilenceWarning =
    recordingState?.status === VideoRecordingStatus.RECORDING &&
    selection.microphoneEnabled &&
    recordingState.microphoneActivity?.warning === true;
  return (
    <div className="mt-3 grid gap-3 px-3">
      <MicrophoneStatus
        readOnly={readOnly}
        selection={selection}
        onActiveRecordingSettingsChange={onActiveRecordingSettingsChange}
      />
      <WebcamStatus
        readOnly={readOnly}
        selection={selection}
        onActiveRecordingSettingsChange={onActiveRecordingSettingsChange}
      />
      {showSilenceWarning ? (
        <p
          role="status"
          data-ui="popup.video-active.microphone-warning"
          className="text-xs text-[var(--sniptale-color-text-primary)]"
        >
          {translate('popup.video.microphoneSilenceWarning')}
        </p>
      ) : null}
    </div>
  );
}

function ActiveMediaMuteButton({
  readOnly,
  enabled,
  labelWhenEnabled,
  labelWhenMuted,
  onToggle,
  type,
}: {
  readOnly: boolean;
  enabled: boolean;
  labelWhenEnabled: string;
  labelWhenMuted: string;
  onToggle: () => Promise<void>;
  type: 'microphone' | 'webcam';
}) {
  const [busy, setBusy] = useState(false);
  const Icon = type === 'microphone' ? (enabled ? Mic : MicOff) : enabled ? Video : VideoOff;
  const label = enabled ? labelWhenEnabled : labelWhenMuted;
  const handleClick = () => {
    if (readOnly || busy) return;
    setBusy(true);
    void onToggle().finally(() => setBusy(false));
  };

  return (
    <button
      type="button"
      className={[
        'inline-flex h-7 w-7 items-center justify-center rounded-[7px]',
        'text-[var(--sniptale-color-text-muted-strong)] transition-colors',
        'hover:text-[var(--sniptale-color-accent-emphasis)]',
        'focus:outline-none focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-[var(--sniptale-color-accent)]',
        'disabled:cursor-default disabled:opacity-50',
      ].join(' ')}
      aria-label={label}
      disabled={busy || readOnly}
      title={readOnly ? translate('popup.video.countdownMediaReadOnly') : label}
      onClick={handleClick}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
