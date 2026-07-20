import { SegmentedRow } from '../../../../../ui/compact-inspector-controls';

interface OptionButtonsOption<TValue extends string> {
  disabled?: boolean;
  label: string;
  value: TValue;
}

export function OptionButtonsField<TValue extends string>(props: {
  disabled?: boolean;
  label: string;
  layout?: 'inline' | 'stacked';
  onChange: (value: TValue) => void;
  options: readonly OptionButtonsOption<TValue>[];
  value: TValue;
}) {
  const columns = resolveSegmentedColumns(props.options.length);

  return (
    <SegmentedRow
      ariaLabel={props.label}
      label={props.label}
      {...(props.layout === undefined ? {} : { layout: props.layout })}
      {...(columns === undefined ? {} : { columns })}
      value={props.value}
      onChange={props.onChange}
      options={props.options.map((option) => ({
        ...option,
        disabled: props.disabled === true || option.disabled === true,
      }))}
    />
  );
}

function resolveSegmentedColumns(optionCount: number): 2 | 3 | 4 | 5 | undefined {
  if (optionCount === 2 || optionCount === 3) {
    return optionCount;
  }

  if (optionCount === 4) {
    return 2;
  }

  return undefined;
}
