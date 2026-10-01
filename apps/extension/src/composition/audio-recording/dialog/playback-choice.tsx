import { translate } from '../../../platform/i18n';
import { ProductToggle } from '@sniptale/ui/product-form-controls';
import { useId } from 'react';

/** Capture-only setting; preview sound stays silent while the microphone is live. */
export function RecordingPlaybackChoice(props: {
  checked: boolean;
  disabled: boolean;
  onChange(checked: boolean): void;
}) {
  const labelId = useId();
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <ProductToggle
        size="sm"
        checked={props.checked}
        data-ui="audio-recording.play-video"
        aria-labelledby={labelId}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
      />
      <span id={labelId}>{translate('videoEditor.app.recordAudioPlayVideo')}</span>
    </span>
  );
}
