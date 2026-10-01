import { useId, useState } from 'react';
import { ProductInput, ProductToggle } from '@sniptale/ui/product-form-controls';
import { translate } from '../../../platform/i18n';

/** A capture cap is a draft in seconds, bounded by the available destination interval. */
export function useRecordingDurationLimit(maximum: number) {
  const [enabled, setEnabled] = useState(true);
  const [draft, setText] = useState<string | null>(null);
  const text = draft ?? String(Math.min(60, Math.max(0, maximum)));
  const value = Number(text);
  const invalid =
    enabled && (!text.trim() || !Number.isFinite(value) || value <= 0 || value > maximum);
  return {
    enabled,
    setEnabled,
    text,
    setText,
    invalid,
    seconds: enabled && !invalid ? value : undefined,
    effective: enabled && !invalid ? value : maximum,
  };
}

/** Both timeline recorders expose the same switch, numeric draft and validation. */
export function RecordingDurationLimit(props: {
  value: ReturnType<typeof useRecordingDurationLimit>;
  maximum: number;
  disabled: boolean;
}) {
  const labelId = useId();
  const errorId = useId();
  const { value } = props;
  const label = translate('gallery.videoReview.voiceoverDurationLimit');
  return (
    <div className="grid gap-1 text-xs" data-ui="audio-recording.duration-options">
      <div className="flex items-center gap-2">
        <ProductToggle
          size="sm"
          checked={value.enabled}
          data-ui="audio-recording.duration-limit"
          aria-labelledby={labelId}
          disabled={props.disabled}
          onClick={() => value.setEnabled(!value.enabled)}
        />
        <span id={labelId}>{label}</span>
        {value.enabled ? (
          <>
            <ProductInput
              type="number"
              min="0"
              max={props.maximum}
              step="any"
              className="!w-20"
              aria-label={label}
              aria-describedby={value.invalid ? errorId : undefined}
              invalid={value.invalid}
              aria-invalid={value.invalid}
              value={value.text}
              disabled={props.disabled}
              onChange={(event) => value.setText(event.currentTarget.value)}
            />
            <span>{translate('videoEditor.app.recordAudioSeconds')}</span>
          </>
        ) : null}
      </div>
      {value.invalid ? (
        <p id={errorId} role="alert" className="text-[var(--sniptale-color-danger-text)]">
          {translate('videoEditor.app.recordAudioLimitInvalid')}
        </p>
      ) : null}
    </div>
  );
}
