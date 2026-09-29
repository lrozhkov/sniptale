import { translate } from '../../../platform/i18n';

/** Capture-only setting; preview sound stays silent while the microphone is live. */
export function RecordingPlaybackChoice(props: {
  checked: boolean;
  disabled: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        data-ui="audio-recording.play-video"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      {translate('videoEditor.app.recordAudioPlayVideo')}
    </label>
  );
}
