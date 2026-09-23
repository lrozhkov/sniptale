import { NumericValueField } from '../../chrome/ui';

interface SizeControlInputProps {
  dataUi?: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}

/** Dimensions share numeric editing, stepper, focus and cancellation with other inspectors. */
export function SizeControlInput(props: SizeControlInputProps) {
  return (
    <div data-ui={props.dataUi} className="min-w-0">
      <span className="block text-[11px] text-[color:var(--sniptale-color-text-secondary)]">
        {props.label}
      </span>
      <NumericValueField
        className="!w-full"
        label={props.label}
        value={props.value}
        min={1}
        precision={0}
        normalizeValue={(value) => Math.max(1, Math.round(value))}
        onPreviewValue={() => undefined}
        onCommitValue={props.onChange}
      />
    </div>
  );
}
