import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useState } from 'react';
import { translate, type TranslationKey } from '../../../../platform/i18n';
import type {
  VideoRecordingSettings,
  WebcamActualSettings,
} from '@sniptale/runtime-contracts/video/types/types';
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

const ROW_CLASS_NAME = 'grid min-w-0 grid-cols-[18px_minmax(0,1fr)_28px] items-center gap-2';
const STATUS_ROW_CLASS_NAME = 'grid min-w-0 grid-cols-[18px_minmax(0,1fr)] items-center gap-2';
const LABEL_CLASS_NAME = 'truncate text-[11px] text-[var(--sniptale-color-text-muted-strong)]';
const VALUE_CLASS_NAME = 'truncate text-xs font-medium text-[var(--sniptale-color-text-primary)]';
const STATUS_TEXT_CLASS_NAME = 'truncate text-xs text-[var(--sniptale-color-text-muted-strong)]';

function resolveSelectedName(label: string | null, fallbackKey: TranslationKey): string {
  const trimmed = label?.trim();
  return trimmed || translate(fallbackKey);
}

function MicrophoneStatus({
  onActiveRecordingSettingsChange,
  selection,
}: {
  onActiveRecordingSettingsChange: (patch: Partial<VideoRecordingSettings>) => Promise<void>;
  selection: VideoActiveMediaSelection;
}) {
  if (!selection.microphoneSelected) {
    return <InactiveMicrophoneStatus />;
  }

  return (
    <ActiveMicrophoneStatus
      selection={selection}
      onActiveRecordingSettingsChange={onActiveRecordingSettingsChange}
    />
  );
}

function InactiveMicrophoneStatus() {
  const statusText = translate('popup.video.activeMicrophoneNotRecorded');
  return (
    <div className={STATUS_ROW_CLASS_NAME}>
      <MicOff className="h-4 w-4 text-[var(--sniptale-color-text-muted-strong)]" />
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
  onActiveRecordingSettingsChange,
  selection,
}: {
  onActiveRecordingSettingsChange: (patch: Partial<VideoRecordingSettings>) => Promise<void>;
  selection: VideoActiveMediaSelection;
}) {
  const selectedName = resolveSelectedName(
    selection.microphoneLabel,
    'popup.video.activeMicrophoneNotSelected'
  );

  return (
    <div className={ROW_CLASS_NAME}>
      {selection.microphoneEnabled ? (
        <Mic className="h-4 w-4 text-[var(--sniptale-color-text-muted-strong)]" />
      ) : (
        <MicOff className="h-4 w-4 text-[var(--sniptale-color-text-muted-strong)]" />
      )}
      <div className="min-w-0">
        <div className={LABEL_CLASS_NAME}>{translate('popup.video.activeMicrophoneLabel')}</div>
        <div className={VALUE_CLASS_NAME} title={selectedName}>
          {selectedName}
        </div>
      </div>
      <ActiveMediaMuteButton
        enabled={selection.microphoneEnabled}
        labelWhenEnabled={translate('popup.video.activeMicrophoneMute')}
        labelWhenMuted={translate('popup.video.activeMicrophoneUnmute')}
        onToggle={() =>
          onActiveRecordingSettingsChange({ microphoneEnabled: !selection.microphoneEnabled })
        }
        type="microphone"
      />
    </div>
  );
}

function WebcamStatus({
  onActiveRecordingSettingsChange,
  selection,
}: {
  onActiveRecordingSettingsChange: (patch: Partial<VideoRecordingSettings>) => Promise<void>;
  selection: VideoActiveMediaSelection;
}) {
  if (!selection.webcamSelected) {
    return <InactiveWebcamStatus />;
  }

  return (
    <ActiveWebcamStatus
      selection={selection}
      onActiveRecordingSettingsChange={onActiveRecordingSettingsChange}
    />
  );
}

function InactiveWebcamStatus() {
  const statusText = translate('popup.video.activeWebcamNotRecorded');
  return (
    <div className={STATUS_ROW_CLASS_NAME}>
      <VideoOff className="h-4 w-4 text-[var(--sniptale-color-text-muted-strong)]" />
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
  onActiveRecordingSettingsChange,
  selection,
}: {
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
        <Video className="h-4 w-4 text-[var(--sniptale-color-text-muted-strong)]" />
      ) : (
        <VideoOff className="h-4 w-4 text-[var(--sniptale-color-text-muted-strong)]" />
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
  onActiveRecordingSettingsChange,
  selection,
}: {
  onActiveRecordingSettingsChange: (patch: Partial<VideoRecordingSettings>) => Promise<void>;
  selection: VideoActiveMediaSelection;
}) {
  return (
    <div className="mt-3 grid gap-3 px-3">
      <MicrophoneStatus
        selection={selection}
        onActiveRecordingSettingsChange={onActiveRecordingSettingsChange}
      />
      <WebcamStatus
        selection={selection}
        onActiveRecordingSettingsChange={onActiveRecordingSettingsChange}
      />
    </div>
  );
}

function ActiveMediaMuteButton({
  enabled,
  labelWhenEnabled,
  labelWhenMuted,
  onToggle,
  type,
}: {
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
      ].join(' ')}
      aria-label={label}
      disabled={busy}
      title={label}
      onClick={handleClick}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
