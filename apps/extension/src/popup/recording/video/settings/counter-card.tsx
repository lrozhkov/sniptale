import { InlineCurtainSelect } from '../inline-controls/curtain-select';

export function CounterCard({
  formatValue,
  formatSelectedValue,
  label,
  notice,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  formatValue?: (value: number) => string;
  formatSelectedValue?: (value: number) => string;
  label: string;
  notice?: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  const options = Array.from({ length: max - min + 1 }, (_, index) => {
    const nextValue = min + index;

    return {
      value: String(nextValue),
      label: formatValue ? formatValue(nextValue) : `${nextValue}${suffix}`,
    };
  });

  return (
    <InlineCurtainSelect
      ariaLabel={label}
      label={label}
      {...(notice === undefined ? {} : { notice })}
      onChange={(nextValue) => onChange(Number(nextValue))}
      options={options}
      {...(formatSelectedValue === undefined ? {} : { selectedLabel: formatSelectedValue(value) })}
      value={String(value)}
    />
  );
}
