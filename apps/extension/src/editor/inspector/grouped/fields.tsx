import {
  CompactSelect,
  SelectField as CompactInspectorSelectField,
  type CompactSelectOption,
} from '../../../ui/compact-inspector-controls';

/**
 * Editor-inspector select with a wrapping dropdown menu so long localized option
 * labels (for example frame layout modes) stay readable instead of truncating.
 */
export function EditorInspectorSelectInput<T extends string>(props: {
  ariaLabel?: string | undefined;
  label?: string | undefined;
  value: T;
  onChange: (value: T) => void;
  options: readonly CompactSelectOption<T>[];
  disabled?: boolean;
}) {
  if (props.label !== undefined) {
    return (
      <CompactInspectorSelectField
        className="min-h-8! border-transparent! bg-transparent! px-0! py-0!"
        label={props.label}
        value={props.value}
        onChange={props.onChange}
        options={props.options}
        menuClassName="editor-inspector-select-menu"
        {...(props.disabled === undefined ? {} : { disabled: props.disabled })}
      />
    );
  }

  return (
    <CompactSelect
      appearance="plain"
      aria-label={props.ariaLabel ?? props.label ?? ''}
      value={props.value}
      onChange={props.onChange}
      options={props.options}
      menuClassName="editor-inspector-select-menu"
      {...(props.disabled === undefined ? {} : { disabled: props.disabled })}
      className="w-full"
    />
  );
}
