import type React from 'react';
import { cx, type CompactSelectOption } from '../../../ui/compact-inspector-controls';
import { ToggleGrid } from './primitives';

type SelectorColumns = 1 | 2 | 3 | 4 | 5;

function getSelectorColumnsClassName(columns: SelectorColumns): string {
  if (columns === 1) {
    return 'grid grid-cols-1 gap-2';
  }
  if (columns === 2) {
    return 'grid grid-cols-2 gap-2';
  }
  if (columns === 5) {
    return 'grid grid-cols-5 gap-1.5';
  }
  if (columns === 4) {
    return 'grid grid-cols-4 gap-1.5';
  }

  return 'grid grid-cols-3 gap-2';
}

const PREVIEW_TILE_BUTTON_CLASS_NAME = [
  'flex min-h-14 items-center justify-center rounded-[8px] border px-2 py-2 transition',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_86%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_78%,transparent)]',
  'text-[color:var(--sniptale-color-text-secondary)]',
  'hover:border-[color:var(--sniptale-color-border-strong)]',
].join(' ');

const PREVIEW_TILE_BUTTON_ACTIVE_CLASS_NAME = [
  'border-[color:var(--sniptale-color-accent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_18%,transparent)]',
  'text-[color:var(--sniptale-color-text-primary)]',
].join(' ');

interface SegmentedSelectorProps<T extends string> {
  ariaLabel: string;
  columns: SelectorColumns;
  onChange: (value: T) => void;
  optionClassName?: string;
  options: readonly CompactSelectOption<T>[];
  value: T;
}

export function SegmentedSelector<T extends string>({
  ariaLabel,
  columns,
  onChange,
  optionClassName,
  options,
  value,
}: SegmentedSelectorProps<T>) {
  return (
    <ToggleGrid
      ariaLabel={ariaLabel}
      columns={columns}
      optionClassName={cx('w-full', optionClassName)}
      options={options.map((option) => ({
        active: option.value === value,
        icon: option.icon,
        label: option.label,
        onToggle: () => onChange(option.value),
      }))}
    />
  );
}

interface PreviewTileGridProps<T extends string> {
  ariaLabel: string;
  columns: SelectorColumns;
  onChange: (value: T) => void;
  options: readonly CompactSelectOption<T>[];
  renderPreview: (option: CompactSelectOption<T>) => React.ReactNode;
  showLabel?: boolean;
  tileClassName?: string;
  value: T;
}

export function PreviewTileGrid<T extends string>({
  ariaLabel,
  columns,
  onChange,
  options,
  renderPreview,
  showLabel = false,
  tileClassName,
  value,
}: PreviewTileGridProps<T>) {
  return (
    <div
      aria-label={ariaLabel}
      className={getSelectorColumnsClassName(columns)}
      role="group"
      data-preview-tile-grid="true"
    >
      {options.map((option) => (
        <PreviewTile
          key={option.value}
          active={option.value === value}
          option={option}
          showLabel={showLabel}
          {...(tileClassName === undefined ? {} : { tileClassName })}
          onChange={onChange}
          renderPreview={renderPreview}
        />
      ))}
    </div>
  );
}

function PreviewTile<T extends string>(props: {
  active: boolean;
  option: CompactSelectOption<T>;
  showLabel: boolean;
  tileClassName?: string;
  onChange: (value: T) => void;
  renderPreview: (option: CompactSelectOption<T>) => React.ReactNode;
}) {
  const { active, option } = props;
  return (
    <button
      type="button"
      aria-label={option.label}
      aria-pressed={active}
      data-preview-option={option.value}
      title={option.label}
      onClick={() => props.onChange(option.value)}
      className={cx(
        PREVIEW_TILE_BUTTON_CLASS_NAME,
        props.showLabel && 'flex-col gap-1.5',
        active && PREVIEW_TILE_BUTTON_ACTIVE_CLASS_NAME,
        props.tileClassName
      )}
    >
      <span aria-hidden="true" className="block w-full text-[color:var(--sniptale-color-accent)]">
        {props.renderPreview(option)}
      </span>
      {props.showLabel ? <PreviewTileLabel label={option.label} /> : null}
    </button>
  );
}

function PreviewTileLabel(props: { label: string }) {
  return (
    <span
      className={[
        'min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap',
        'text-center text-[10px] font-semibold leading-3',
        'text-[color:var(--sniptale-color-text-secondary)]',
      ].join(' ')}
    >
      {props.label}
    </span>
  );
}
