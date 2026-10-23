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
    <label className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-3">
      <span
        className={[
          'col-span-2 text-xs font-normal leading-4',
          'text-[var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        {translate('popup.video.microphoneGainLabel')}
      </span>
      <ProductRange
        className={[
          '[--sniptale-range-shell-height:28px]! [--sniptale-range-track-height:3px]!',
          '[--sniptale-range-thumb-size:14px]!',
        ].join(' ')}
        min="0"
        max="200"
        step="5"
        value={Math.round(gain * 100)}
        aria-label={translate('popup.video.microphoneGainLabel')}
        onChange={(event) =>
          onSettingsChange({ microphoneGain: Number(event.currentTarget.value) / 100 })
        }
      />
      <span className="text-right text-xs tabular-nums text-[var(--sniptale-color-text-primary)]">
        {Math.round(gain * 100)}%
      </span>
    </label>
  );
}
