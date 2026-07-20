import { CompactColorSelector } from '../../../../ui/color-selector';
import { CompactInput, CompactSelect } from '../../../../ui/compact-inspector-controls';
import { Field } from './field-shell';

export function ColorField(props: {
  defaultValue?: string | undefined;
  disabled: boolean;
  label: string;
  modified?: boolean | undefined;
  onChange: (value: string) => void;
  onReset?: (() => void) | undefined;
  value: string;
}) {
  const palette = [
    '#27272a',
    '#09090b',
    '#6b7280',
    '#f97316',
    '#ea580c',
    '#2563eb',
    '#059669',
    '#e11d48',
  ];

  return (
    <Field
      defaultValue={props.defaultValue}
      label={props.label}
      modified={props.modified}
      onReset={props.onReset}
    >
      {props.disabled ? (
        <CompactInput disabled value={props.value} />
      ) : (
        <CompactColorSelector
          label={props.label}
          palette={palette}
          recentColors={[props.defaultValue ?? '', props.value].filter(Boolean)}
          title={props.label}
          value={props.value || props.defaultValue || '#000000'}
          onChange={props.onChange}
        />
      )}
    </Field>
  );
}

export function SelectField<T extends string>(props: {
  defaultValue?: string | undefined;
  disabled: boolean;
  label: string;
  modified?: boolean | undefined;
  onChange: (value: T) => void;
  onReset?: (() => void) | undefined;
  options: Array<{ value: T; label: string }>;
  value: T | '';
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
        value={props.value}
        options={props.options}
        onChange={props.onChange}
      />
    </Field>
  );
}
