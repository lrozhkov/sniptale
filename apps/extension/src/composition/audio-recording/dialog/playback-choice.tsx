import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { Play } from 'lucide-react';

/** Capture-only setting; preview sound stays silent while the microphone is live. */
export function RecordingPlaybackChoice(props: {
  checked: boolean;
  disabled: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <ProductActionButton
      tone="toggle"
      compact
      active={props.checked}
      data-ui="audio-recording.play-video"
      aria-pressed={props.checked}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    >
      <Play size={14} aria-hidden="true" />
      {translate('videoEditor.app.recordAudioPlayVideo')}
    </ProductActionButton>
  );
}
