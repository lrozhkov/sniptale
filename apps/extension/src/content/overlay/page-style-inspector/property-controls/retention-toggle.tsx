import { ProductToggle } from '@sniptale/ui/product-form-controls';

export function RetentionToggle(props: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-[var(--sniptale-color-text-secondary)]">
      <span>{props.label}</span>
      <ProductToggle
        checked={props.checked}
        disabled={props.disabled}
        size="sm"
        aria-label={props.label}
        onClick={() => props.onChange(!props.checked)}
      />
    </div>
  );
}
