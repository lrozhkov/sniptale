import type { ButtonHTMLAttributes } from 'react';

import { cx } from '../compact-inspector-controls/shared';

export interface ProductGradientPreset {
  angle: number;
  from: string;
  id: string;
  label: string;
  to: string;
}

export interface ProductGradientPresetGridProps<T extends ProductGradientPreset> {
  presets: readonly T[];
  onSelect: (preset: T) => void;
  isActive?: (preset: T) => boolean;
  className?: string;
  optionProps?: (preset: T) => ButtonHTMLAttributes<HTMLButtonElement>;
}

function ProductGradientPresetOption<T extends ProductGradientPreset>(props: {
  active: boolean;
  extraProps?: ButtonHTMLAttributes<HTMLButtonElement> | undefined;
  onSelect: (preset: T) => void;
  preset: T;
}) {
  const { active, extraProps, onSelect, preset } = props;
  return (
    <button
      key={preset.id}
      type="button"
      title={preset.label}
      aria-label={preset.label}
      aria-pressed={active}
      {...extraProps}
      onClick={(event) => {
        extraProps?.onClick?.(event);
        if (!event.defaultPrevented) {
          onSelect(preset);
        }
      }}
      className={cx(resolveGradientPresetOptionClassName(active), extraProps?.className)}
      style={{
        ...extraProps?.style,
        backgroundImage: `linear-gradient(${preset.angle}deg, ${preset.from}, ${preset.to})`,
      }}
    >
      <GradientPresetOptionLabel label={preset.label} />
      <GradientPresetOptionOverlay />
    </button>
  );
}

function resolveGradientPresetOptionClassName(active: boolean): string {
  return cx(
    'group relative min-h-12 overflow-hidden rounded-[12px] border px-3 py-3 text-left transition',
    'border-[color:var(--sniptale-color-border-soft)] hover:-translate-y-px',
    'focus-visible:outline-none',
    'focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--sniptale-color-accent)_26%,transparent)]',
    active
      ? [
          'border-[color:var(--sniptale-color-border-accent-strong)]',
          'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_10%,transparent)]',
        ].join(' ')
      : 'hover:border-[color:var(--sniptale-color-border-strong)] hover:shadow-sm'
  );
}

function GradientPresetOptionLabel(props: { label: string }) {
  return (
    <span
      className={[
        'relative z-10 text-xs font-semibold text-[color:var(--sniptale-color-text-inverse)]',
        'drop-shadow-[0_1px_6px_color-mix(in_srgb,var(--sniptale-color-shadow-strong)_44%,transparent)]',
      ].join(' ')}
    >
      {props.label}
    </span>
  );
}

function GradientPresetOptionOverlay() {
  return (
    <span
      className={[
        'absolute inset-0',
        'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--sniptale-color-shadow-strong)_3%,transparent),',
        'color-mix(in_srgb,var(--sniptale-color-shadow-strong)_24%,transparent))]',
      ].join(' ')}
    />
  );
}

export function ProductGradientPresetGrid<T extends ProductGradientPreset>({
  presets,
  onSelect,
  isActive,
  className,
  optionProps,
}: ProductGradientPresetGridProps<T>) {
  return (
    <div className={cx('grid grid-cols-2 gap-2', className)}>
      {presets.map((preset) => {
        const active = isActive?.(preset) ?? false;
        const extraProps = optionProps?.(preset);
        return (
          <ProductGradientPresetOption
            key={preset.id}
            active={active}
            extraProps={extraProps}
            onSelect={onSelect}
            preset={preset}
          />
        );
      })}
    </div>
  );
}
