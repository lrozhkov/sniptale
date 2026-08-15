import { translate } from '../../../../../platform/i18n/popup';
import { resolveMicrophoneGain } from '@sniptale/runtime-contracts/video/types/microphone-processing';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { ProductRange } from '@sniptale/ui/product-form-controls';

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
      <span
        className={[
          'flex items-center justify-between gap-2 text-[10px] font-medium',
          'text-[var(--sniptale-color-text-muted-strong)]',
        ].join(' ')}
      >
        <span>{translate('popup.video.microphoneGainLabel')}</span>
        <span className="tabular-nums text-[var(--sniptale-color-text-primary)]">
          {Math.round(gain * 100)}%
        </span>
      </span>
      <ProductRange
        min="0"
        max="200"
        step="5"
        value={Math.round(gain * 100)}
        aria-label={translate('popup.video.microphoneGainLabel')}
        onChange={(event) =>
          onSettingsChange({ microphoneGain: Number(event.currentTarget.value) / 100 })
        }
      />
    </label>
  );
}
