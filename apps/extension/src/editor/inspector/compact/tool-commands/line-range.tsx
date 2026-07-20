import { NumericRow } from '../../../chrome/ui';

export function LineRange(props: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  onValueCommit: () => void;
  step?: number;
  value: number;
}) {
  return (
    <NumericRow
      label={props.label}
      value={props.value}
      min={props.min}
      max={props.max}
      step={props.step}
      onPreviewValue={props.onChange}
      onCommitValue={(value) => {
        props.onChange(value);
        props.onValueCommit();
      }}
      scrub={{ min: props.min, max: props.max, step: props.step }}
    />
  );
}
