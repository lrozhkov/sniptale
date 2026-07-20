import { translate } from '../../../../../platform/i18n';
import { SliderField } from '../shared/sliders';
import { ToggleField } from '../shared/controls';

export function AudioMuteToggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return <ToggleField checked={checked} disabled={disabled} label={label} onChange={onChange} />;
}

export function AudioVolumeField({
  disabled,
  value,
  onChange,
}: {
  disabled: boolean;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <SliderField
      disabled={disabled}
      label={translate('videoEditor.sidebar.volumeLabel')}
      value={value}
      min={0}
      max={2}
      step={0.05}
      onChange={onChange}
      formatValue={(nextValue) => `${Math.round(nextValue * 100)}%`}
    />
  );
}

export function AudioEnvelopeFields({
  disabled,
  endValue,
  onChange,
  startValue,
}: {
  disabled: boolean;
  endValue: number;
  onChange: (patch: { volumeEnvelopeEnd?: number; volumeEnvelopeStart?: number }) => void;
  startValue: number;
}) {
  return (
    <div className="space-y-3">
      <SliderField
        disabled={disabled}
        label={translate('videoEditor.sidebar.volumeEnvelopeStartLabel')}
        value={startValue}
        min={0}
        max={2}
        step={0.05}
        onChange={(value) => onChange({ volumeEnvelopeStart: value })}
        formatValue={(nextValue) => `${Math.round(nextValue * 100)}%`}
      />
      <SliderField
        disabled={disabled}
        label={translate('videoEditor.sidebar.volumeEnvelopeEndLabel')}
        value={endValue}
        min={0}
        max={2}
        step={0.05}
        onChange={(value) => onChange({ volumeEnvelopeEnd: value })}
        formatValue={(nextValue) => `${Math.round(nextValue * 100)}%`}
      />
    </div>
  );
}
