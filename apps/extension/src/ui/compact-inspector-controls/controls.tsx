import type React from 'react';
import { useRef, useState } from 'react';
import { CompactColorSelector, type CompactColorSelectorProps } from '../color-selector';
import { CompactSelect, type CompactSelectOption } from './primitives';
import { CompactSegmentedSelector } from './control-renderers';
import { cx } from './shared';

const FIELD_LABEL_CLASS_NAME = [
  'flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold',
  'text-[color:var(--sniptale-color-text-secondary)]',
].join(' ');

const COLOR_TRIGGER_CLASS_NAME = [
  'ml-auto min-w-0 !w-[8.75rem] max-w-[58%] shrink-0',
  "[&_[data-ui='shared.ui.color-selector.trigger']]:h-8",
  "[&_[data-ui='shared.ui.color-selector.trigger']]:rounded-[7px]",
  "[&_[data-ui='shared.ui.color-selector.trigger']]:border-transparent",
  "[&_[data-ui='shared.ui.color-selector.trigger']]:bg-transparent",
  "[&_[data-ui='shared.ui.color-selector.trigger']]:px-0",
  "[&_[data-ui='shared.ui.color-selector.trigger']]:shadow-none",
].join(' ');

const SELECT_FIELD_TRIGGER_CLASS_NAME =
  'h-8 min-w-0 w-full border-transparent bg-transparent px-0 shadow-none';

const SELECT_FIELD_CONTAINER_CLASS_NAME = 'ml-auto min-w-0 !w-[8.75rem] max-w-[58%] shrink-0';

function getNodeTitle(value: React.ReactNode): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function ColorField({ className, ...props }: CompactColorSelectorProps) {
  const [open, setOpen] = useState(false);
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    props.onOpenChange?.(nextOpen);
  };

  return (
    <div
      data-ui="shared.ui.compact-inspector.color-field"
      data-open={open ? 'true' : 'false'}
      className={cx(
        'flex min-h-10 w-full min-w-0 items-center justify-between gap-3 rounded-[10px] border px-3 py-1.5',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
        open
          ? 'border-[color:var(--sniptale-color-border-accent-strong)]'
          : 'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        className
      )}
    >
      <span className={cx('min-w-0', FIELD_LABEL_CLASS_NAME)} title={props.label}>
        {props.label}
      </span>
      <CompactColorSelector
        {...props}
        className={COLOR_TRIGGER_CLASS_NAME}
        onOpenChange={handleOpenChange}
      />
    </div>
  );
}

export function SelectField<T extends string>(props: {
  label: string;
  value: T | '';
  options: readonly CompactSelectOption<T>[];
  onChange: (value: T) => void;
  className?: string | undefined;
  disabled?: boolean | undefined;
  menuClassName?: string | undefined;
  selectClassName?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={rowRef}
      data-ui="shared.ui.compact-inspector.select-field"
      data-open={open ? 'true' : 'false'}
      className={cx(
        'flex min-h-10 w-full min-w-0 items-center justify-between gap-3 rounded-[10px] border px-3 py-1.5',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
        open
          ? 'border-[color:var(--sniptale-color-border-accent-strong)]'
          : 'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        props.className
      )}
    >
      <span className={cx('min-w-0', FIELD_LABEL_CLASS_NAME)} title={props.label}>
        {props.label}
      </span>
      <CompactSelect
        aria-label={props.label}
        value={props.value}
        options={props.options}
        onChange={props.onChange}
        disabled={props.disabled}
        onOpenChange={setOpen}
        className={cx(SELECT_FIELD_TRIGGER_CLASS_NAME, props.selectClassName)}
        containerClassName={SELECT_FIELD_CONTAINER_CLASS_NAME}
        menuAnchorRef={rowRef}
        {...(props.menuClassName === undefined ? {} : { menuClassName: props.menuClassName })}
      />
    </div>
  );
}

export function SegmentedRow<T extends string>(props: {
  ariaLabel: string;
  columns?: 2 | 3 | 4 | 5;
  label?: React.ReactNode | undefined;
  layout?: 'inline' | 'stacked';
  options: Array<{ disabled?: boolean; icon?: React.ReactNode; label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const columns = props.columns ?? 3;
  const stacked = props.layout === 'stacked';
  const selector = (
    <CompactSegmentedSelector
      ariaLabel={props.ariaLabel}
      columns={columns}
      onChange={props.onChange}
      options={props.options}
      value={props.value}
    />
  );

  if (props.label === undefined) {
    return selector;
  }

  return (
    <div
      data-ui="shared.ui.compact-inspector.segmented-field"
      className={cx(
        stacked
          ? 'grid min-h-10 gap-2 rounded-[10px] border px-3 py-2'
          : 'flex min-h-10 items-center justify-between gap-3 rounded-[10px] border px-3 py-1.5',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]'
      )}
    >
      <span
        className={cx(stacked ? 'min-w-0' : 'min-w-0 shrink-0', FIELD_LABEL_CLASS_NAME)}
        title={getNodeTitle(props.label)}
      >
        {props.label}
      </span>
      {selector}
    </div>
  );
}
