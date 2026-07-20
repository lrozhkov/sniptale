import { translate } from '../../../../../platform/i18n';
import { resolveMicrophoneGain } from '@sniptale/runtime-contracts/video/types/microphone-processing';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';

export function MicrophoneGainControl({
  onSettingsChange,
  settings,
}: {
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
  settings: VideoRecordingSettings;
}) {
  const gain = resolveMicrophoneGain(settings);
  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] font-medium text-[var(--sniptale-color-text-muted-strong)]">
        {translate('popup.video.microphoneGainLabel')}
      </span>
      <input
        type="range"
        min={0}
        max={200}
        step={5}
        value={Math.round(gain * 100)}
        onChange={(event) =>
          onSettingsChange({ microphoneGain: Number(event.currentTarget.value) / 100 })
        }
      />
      <span className="text-[10px] text-[var(--sniptale-color-text-secondary)]">
        {Math.round(gain * 100)}%
      </span>
    </label>
  );
}
