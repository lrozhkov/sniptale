import { CompactInput } from '../../../../ui/compact-inspector-controls';
import { Field } from './field-shell';

function displayCssTextValue(value: string, emptyValues: readonly string[]): string {
  const normalized = value.trim().toLowerCase();
  return emptyValues.includes(normalized) ? '' : value;
}

function inputCssTextValue(value: string, fallbackValue: string, emptyValues: readonly string[]) {
  if (value.trim()) {
    return value;
  }

  const fallback = fallbackValue.trim().toLowerCase();
  return emptyValues.includes(fallback) ? fallbackValue : value;
}

export function CssTextField(props: {
  defaultValue?: string | undefined;
  disabled: boolean;
  emptyValues?: readonly string[] | undefined;
  label: string;
  modified?: boolean | undefined;
  onChange: (value: string) => void;
  onReset?: (() => void) | undefined;
  placeholder?: string | undefined;
  value: string;
}) {
  const emptyValues = props.emptyValues ?? ['none', 'normal'];
  const displayedValue = displayCssTextValue(props.value, emptyValues);
  const displayedDefault = displayCssTextValue(props.defaultValue ?? '', emptyValues);

  return (
    <Field
      defaultValue={displayedDefault || undefined}
      label={props.label}
      modified={props.modified}
      onReset={props.onReset}
    >
      <CompactInput
        aria-label={props.label}
        disabled={props.disabled}
        placeholder={props.placeholder}
        value={displayedValue}
        onChange={(event) =>
          props.onChange(
            inputCssTextValue(event.currentTarget.value, props.defaultValue ?? '', emptyValues)
          )
        }
      />
    </Field>
  );
}

export function TextField(props: {
  defaultValue?: string | undefined;
  disabled: boolean;
  label: string;
  modified?: boolean | undefined;
  onChange: (value: string) => void;
  onReset?: (() => void) | undefined;
  placeholder?: string | undefined;
  value: string;
}) {
  return (
    <Field
      defaultValue={props.defaultValue}
      label={props.label}
      modified={props.modified}
      onReset={props.onReset}
    >
      <CompactInput
        aria-label={props.label}
        disabled={props.disabled}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </Field>
  );
}
