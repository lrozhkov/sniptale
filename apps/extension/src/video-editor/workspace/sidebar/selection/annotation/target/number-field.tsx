import { NumberInput } from '../../inputs/number';

interface TargetNumberFieldProps {
  disabled: boolean;
  label: string;
  max?: number;
  min?: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

const VIDEO_TARGET_NUMBER_MAX = 7680;

export function TargetNumberField(props: TargetNumberFieldProps) {
  const max = props.max ?? VIDEO_TARGET_NUMBER_MAX;
  const minProps = props.min === undefined ? {} : { min: props.min };

  return (
    <NumberInput
      label={props.label}
      value={props.value}
      step={props.step}
      disabled={props.disabled}
      onChange={props.onChange}
      max={max}
      {...minProps}
    />
  );
}
