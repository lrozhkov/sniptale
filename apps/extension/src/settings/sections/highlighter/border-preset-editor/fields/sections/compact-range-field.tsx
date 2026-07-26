import { ProductRange } from '@sniptale/ui/product-form-controls';

export function EditorCompactRangeField({
  displaySuffix,
  label,
  max,
  min,
  onChange,
  value,
}: {
  displaySuffix?: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <label className="truncate text-[var(--sniptale-color-text-secondary)]">{label}</label>
        <output className="shrink-0 font-medium tabular-nums text-[var(--sniptale-color-text-primary)]">
          {value}
          {displaySuffix}
        </output>
      </div>
      <ProductRange
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="w-full"
      />
    </div>
  );
}
