import { useState } from 'react';
import { translate, type TranslationKey } from '../../../../../platform/i18n';
import {
  getMicrophoneConstraintStatus,
  MICROPHONE_CONSTRAINT_KEYS,
  resolveMicrophoneBooleanSetting,
  type MicrophoneConstraintKey,
  type MicrophoneConstraintStatus,
} from '@sniptale/runtime-contracts/video/types/microphone-processing';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import type { MicrophoneActualSettings } from '@sniptale/runtime-contracts/video/types/types';
import { MicrophoneLevelMeter } from './microphone-level-meter';
import { useMicrophoneProbe } from './microphone-probe';
import { MicrophoneTestRecorder } from './microphone-test-recorder';
import { formatActualMicrophoneSettings } from './microphone-actual-settings';
import { MicrophoneGainControl } from './microphone-gain-control';

type MicrophoneSettingsPanelProps = {
  currentDeviceId: string | null;
  currentDeviceLabel: string | null;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
  settings: VideoRecordingSettings;
};

const OPTION_BUTTON_CLASS_NAME = [
  'flex min-h-8 w-full items-center justify-between gap-2 rounded-[7px] px-2 text-left',
  'text-xs font-medium transition-colors hover:bg-[var(--sniptale-color-surface-hover)]',
].join(' ');

export function MicrophoneSettingsPanel({
  currentDeviceId,
  currentDeviceLabel,
  onSettingsChange,
  settings,
}: MicrophoneSettingsPanelProps) {
  const probe = useMicrophoneProbe({ currentDeviceId, settings });
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<
    Partial<Record<MicrophoneConstraintKey, MicrophoneConstraintStatus>>
  >({});
  const readyProbe =
    probe.status === 'ready'
      ? {
          capabilities: probe.capabilities,
          settings: probe.settings,
          stream: probe.stream,
          trackSettings: probe.trackSettings,
        }
      : null;

  return (
    <div className="grid gap-3">
      <MicrophoneSettingsHeader currentDeviceLabel={currentDeviceLabel} />
      <MicrophoneProbeStatus probeStatus={probe.status} />
      <MicrophoneLevelMeter stream={readyProbe?.stream ?? null} />
      <div className="text-[11px] font-medium text-[var(--sniptale-color-text-secondary)]">
        {formatActualMicrophoneSettings(readyProbe?.settings ?? null)}
      </div>
      <MicrophoneProcessingList
        onError={() => setErrorKey('popup.video.microphoneStatusError')}
        onSettingsChange={onSettingsChange}
        onStatusOverride={(key, status) =>
          setStatusOverrides((current) => ({ ...current, [key]: status }))
        }
        readyProbe={readyProbe}
        settings={settings}
        statusOverrides={statusOverrides}
      />
      <MicrophoneGainControl settings={settings} onSettingsChange={onSettingsChange} />
      <MicrophoneTestRecorder stream={readyProbe?.stream ?? null} />
      {errorKey ? (
        <div className="text-[11px] text-[var(--sniptale-color-danger)]">{translate(errorKey)}</div>
      ) : null}
    </div>
  );
}

type ReadyMicrophoneProbe = {
  capabilities: MediaTrackCapabilities | null;
  settings: MicrophoneActualSettings;
  stream: MediaStream;
  trackSettings: MediaTrackSettings;
};

function MicrophoneProcessingList({
  onError,
  onSettingsChange,
  onStatusOverride,
  readyProbe,
  settings,
  statusOverrides,
}: {
  onError: () => void;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
  onStatusOverride: (key: MicrophoneConstraintKey, status: MicrophoneConstraintStatus) => void;
  readyProbe: ReadyMicrophoneProbe | null;
  settings: VideoRecordingSettings;
  statusOverrides: Partial<Record<MicrophoneConstraintKey, MicrophoneConstraintStatus>>;
}) {
  return (
    <div className="grid gap-1">
      {MICROPHONE_CONSTRAINT_KEYS.map((key) => (
        <MicrophoneProcessingToggle
          key={key}
          constraintKey={key}
          disabled={!readyProbe}
          onApplyStatus={(status) => onStatusOverride(key, status)}
          onError={onError}
          onSettingsChange={onSettingsChange}
          settings={settings}
          status={
            statusOverrides[key] ??
            resolveConstraintStatus({
              key,
              settings,
              capabilities: readyProbe?.capabilities ?? null,
              isReady: readyProbe !== null,
              trackSettings: readyProbe?.trackSettings ?? null,
            })
          }
          stream={readyProbe?.stream ?? null}
        />
      ))}
    </div>
  );
}

function MicrophoneSettingsHeader({ currentDeviceLabel }: { currentDeviceLabel: string | null }) {
  return (
    <div>
      <div className="pr-8 text-xs font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate('popup.video.microphoneSettingsTitle')}
      </div>
      <div className="mt-0.5 truncate text-[10px] text-[var(--sniptale-color-text-muted-strong)]">
        {currentDeviceLabel ?? translate('popup.video.microphoneSettingsNoDevice')}
      </div>
    </div>
  );
}

function MicrophoneProbeStatus({ probeStatus }: { probeStatus: string }) {
  if (probeStatus === 'loading') {
    return (
      <div className="text-[11px] text-[var(--sniptale-color-text-secondary)]">
        {translate('popup.video.microphoneSettingsLoading')}
      </div>
    );
  }
  if (probeStatus === 'error') {
    return (
      <div className="text-[11px] text-[var(--sniptale-color-danger)]">
        {translate('popup.video.microphoneSettingsError')}
      </div>
    );
  }
  return null;
}

function MicrophoneProcessingToggle({
  constraintKey,
  disabled,
  onApplyStatus,
  onError,
  onSettingsChange,
  settings,
  status,
  stream,
}: {
  constraintKey: MicrophoneConstraintKey;
  disabled: boolean;
  onApplyStatus: (status: MicrophoneConstraintStatus) => void;
  onError: () => void;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
  settings: VideoRecordingSettings;
  status: MicrophoneConstraintStatus;
  stream: MediaStream | null;
}) {
  const active = resolveMicrophoneBooleanSetting(settings, constraintKey);
  const unsupported = status === 'unsupported';
  return (
    <button
      type="button"
      className={[
        OPTION_BUTTON_CLASS_NAME,
        active
          ? 'text-[var(--sniptale-color-accent)]'
          : 'text-[var(--sniptale-color-text-secondary)]',
      ].join(' ')}
      disabled={disabled || unsupported}
      onClick={() =>
        applyMicrophoneConstraint({
          constraintKey,
          nextValue: !active,
          onApplyStatus,
          onError,
          onSettingsChange,
          stream,
        })
      }
    >
      <span>{translate(getConstraintLabelKey(constraintKey))}</span>
      <span className="text-[10px] text-[var(--sniptale-color-text-muted-strong)]">
        {translate(getStatusLabelKey(status))}
      </span>
    </button>
  );
}

async function applyMicrophoneConstraint({
  constraintKey,
  nextValue,
  onApplyStatus,
  onError,
  onSettingsChange,
  stream,
}: {
  constraintKey: MicrophoneConstraintKey;
  nextValue: boolean;
  onApplyStatus: (status: MicrophoneConstraintStatus) => void;
  onError: () => void;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
  stream: MediaStream | null;
}) {
  const [track] = stream?.getAudioTracks() ?? [];
  try {
    await track?.applyConstraints?.({ [constraintKey]: nextValue });
    const status = track
      ? getMicrophoneConstraintStatus({
          capabilities:
            typeof track.getCapabilities === 'function' ? track.getCapabilities() : null,
          desired: nextValue,
          key: constraintKey,
          settings: track.getSettings(),
        })
      : 'unknown';
    onApplyStatus(status);
    onSettingsChange({ [constraintKey]: nextValue });
  } catch {
    onApplyStatus('error');
    onError();
  }
}

function resolveConstraintStatus({
  capabilities,
  isReady,
  key,
  settings,
  trackSettings,
}: {
  capabilities: MediaTrackCapabilities | null;
  isReady: boolean;
  key: MicrophoneConstraintKey;
  settings: VideoRecordingSettings;
  trackSettings: MediaTrackSettings | null;
}): MicrophoneConstraintStatus {
  if (!isReady) {
    return 'unknown';
  }

  return getMicrophoneConstraintStatus({
    capabilities,
    desired: resolveMicrophoneBooleanSetting(settings, key),
    key,
    settings: trackSettings,
  });
}

function getConstraintLabelKey(key: MicrophoneConstraintKey): TranslationKey {
  switch (key) {
    case 'echoCancellation':
      return 'popup.video.microphoneEchoCancellation';
    case 'noiseSuppression':
      return 'popup.video.microphoneNoiseSuppression';
    case 'autoGainControl':
      return 'popup.video.microphoneAutoGainControl';
  }
}

function getStatusLabelKey(status: MicrophoneConstraintStatus): TranslationKey {
  switch (status) {
    case 'applied':
      return 'popup.video.microphoneStatusApplied';
    case 'unsupported':
      return 'popup.video.microphoneStatusUnsupported';
    case 'not-confirmed':
      return 'popup.video.microphoneStatusNotConfirmed';
    case 'error':
      return 'popup.video.microphoneStatusError';
    case 'unknown':
      return 'popup.video.microphoneStatusUnknown';
  }
}
