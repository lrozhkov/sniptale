import { CompactSelect } from '../../../../../ui/compact-inspector-controls';
import { Field, PAGE_STYLE_SELECT_CLASS_NAME } from '../field-shell';
import type { TextSelectOption } from './options';

export function TextSelectField(props: {
  className?: string | undefined;
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
      className={props.className}
      defaultValue={props.defaultValue}
      label={props.label}
      modified={props.modified}
      onReset={props.onReset}
    >
      <CompactSelect
        aria-label={props.label}
        className={PAGE_STYLE_SELECT_CLASS_NAME}
        disabled={props.disabled}
        options={props.options}
        title={props.value}
        value={props.value}
        onChange={props.onChange}
      />
    </Field>
  );
}
