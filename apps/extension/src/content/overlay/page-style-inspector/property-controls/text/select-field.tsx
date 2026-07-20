import { CompactSelect } from '../../../../../ui/compact-inspector-controls';
import { Field } from '../field-shell';
import type { TextSelectOption } from './options';

export function TextSelectField(props: {
  defaultValue?: string | undefined;
  disabled: boolean;
  label: string;
  modified?: boolean | undefined;
  onChange: (value: string) => void;
  onReset?: (() => void) | undefined;
  options: readonly TextSelectOption[];
  value: string;
}) {
  return (
    <Field
      defaultValue={props.defaultValue}
      label={props.label}
      modified={props.modified}
      onReset={props.onReset}
    >
      <CompactSelect
        aria-label={props.label}
        disabled={props.disabled}
        options={props.options}
        value={props.value}
        onChange={props.onChange}
      />
    </Field>
  );
}
