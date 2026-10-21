import type React from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { CompactColorSelector, type CompactColorSelectorProps } from '../color-selector';
import { CompactSelect, type CompactSelectOption } from './primitives';
import { CompactSegmentedSelector } from './control-renderers';
import { cx } from './shared';
import { InspectorParameterRow, useInspectorLayout } from './layout';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';

/** Immediate boolean parameters retain the shared name/value construction. */
export function ToggleField(props: {
  label: string;
  value: boolean;
  disabled?: boolean | undefined;
  onChange(value: boolean): void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <InspectorParameterRow
      label={props.label}
      keepInline
      className="sniptale-boolean-parameter"
      onActivate={() => trigger.current?.click()}
    >
      <ProductGlassSwitch
        ref={trigger}
        role="switch"
        aria-label={props.label}
        aria-checked={props.value}
        on={props.value}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.value)}
      />
    </InspectorParameterRow>
  );
}

/** Conditions and mixed boolean values retain native checkbox semantics in the value column. */
export function CheckboxField(props: {
  label: string;
  value: boolean;
  indeterminate?: boolean | undefined;
  disabled?: boolean | undefined;
  onChange(value: boolean): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (input.current) input.current.indeterminate = props.indeterminate ?? false;
  });
  return (
    <InspectorParameterRow
      label={props.label}
      keepInline
      className="sniptale-boolean-parameter"
      onActivate={() => input.current?.click()}
    >
      <input
        ref={input}
        type="checkbox"
        className="sniptale-parameter-check"
        aria-label={props.label}
        checked={props.value}
        disabled={props.disabled}
        onChange={(event) => {
          props.onChange(event.currentTarget.checked);
          event.currentTarget.indeterminate = props.indeterminate ?? false;
        }}
      />
    </InspectorParameterRow>
  );
}

const FIELD_LABEL_CLASS_NAME = [
  'sniptale-interface-label',
  'flex-1 overflow-hidden text-ellipsis whitespace-nowrap',
  'text-[length:var(--sniptale-compact-font-size,12px)] font-semibold',
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

/** Stacked fields give the selector a full row; inline fields retain compact value sizing. */
export function ColorField({
  className,
  layout = 'inline',
  ...props
}: CompactColorSelectorProps & { layout?: 'inline' | 'stacked' }) {
  const [open, setOpen] = useState(false);
  const inspector = useInspectorLayout();
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    props.onOpenChange?.(nextOpen);
  };

  if (inspector)
    return (
      <InspectorParameterRow
        label={props.label}
        valueMinimum={140}
        stacked={layout === 'stacked'}
        dataUi="shared.ui.compact-inspector.color-field"
        className={className}
      >
        <div className="w-full min-w-0">
          <CompactColorSelector
            {...props}
            className="w-full min-w-0"
            onOpenChange={handleOpenChange}
          />
        </div>
      </InspectorParameterRow>
    );
  return (
    <div
      data-ui="shared.ui.compact-inspector.color-field"
      data-open={open ? 'true' : 'false'}
      className={cx(
        layout === 'stacked'
          ? 'flex w-full min-w-0 flex-col items-stretch gap-1'
          : cx(
              'flex min-h-10 w-full min-w-0 items-center justify-between gap-3 rounded-[10px] border px-3 py-1.5',
              'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
              open
                ? 'border-[color:var(--sniptale-color-border-accent-strong)]'
                : 'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]'
            ),
        className
      )}
    >
      <span className={cx('min-w-0', FIELD_LABEL_CLASS_NAME)} title={props.label}>
        {props.label}
      </span>
      <CompactColorSelector
        {...props}
        className={layout === 'stacked' ? 'w-full min-w-0' : COLOR_TRIGGER_CLASS_NAME}
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
  const inspector = useInspectorLayout();

  if (inspector)
    return (
      <InspectorParameterRow
        label={props.label}
        valueText={props.options.find((option) => option.value === props.value)?.label}
        dataUi="shared.ui.compact-inspector.select-field"
        className={props.className}
      >
        <CompactSelect
          aria-label={props.label}
          value={props.value}
          options={props.options}
          onChange={props.onChange}
          disabled={props.disabled}
          onOpenChange={setOpen}
          appearance="plain"
          className={props.selectClassName}
          {...(props.menuClassName === undefined ? {} : { menuClassName: props.menuClassName })}
        />
      </InspectorParameterRow>
    );

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
  const inspector = useInspectorLayout();
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
    return inspector ? <div className="sniptale-parameter-unlabelled">{selector}</div> : selector;
  }

  if (inspector)
    return (
      <InspectorParameterRow
        label={typeof props.label === 'string' ? props.label : props.ariaLabel}
        stacked={stacked}
        valueOptions={props.options.map((option) => option.label)}
        dataUi="shared.ui.compact-inspector.segmented-field"
      >
        {selector}
      </InspectorParameterRow>
    );

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
