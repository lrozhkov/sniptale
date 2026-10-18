import { useRef } from 'react';
import { InspectorFieldClear } from '../../../../ui/compact-inspector-controls/text-field';
import { CompactInput } from '../../../../ui/compact-inspector-controls';
import { Field, PAGE_STYLE_CONTROL_CLASS_NAME } from './field-shell';

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
  const input = useRef<HTMLInputElement>(null);
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
      <div className="sniptale-text-value">
        <CompactInput
          ref={input}
          aria-label={props.label}
          className={`${PAGE_STYLE_CONTROL_CLASS_NAME} !pr-8`}
          disabled={props.disabled}
          placeholder={props.placeholder}
          value={displayedValue}
          onChange={(event) =>
            props.onChange(
              inputCssTextValue(event.currentTarget.value, props.defaultValue ?? '', emptyValues)
            )
          }
        />
        {!props.disabled && displayedValue.length > 0 ? (
          <InspectorFieldClear label={props.label} target={input} />
        ) : null}
      </div>
    </Field>
  );
}
