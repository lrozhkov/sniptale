import type React from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { resolveCompactGridClassName } from '@sniptale/ui/compact-inspector-controls/grid';
import { cx } from './shared';
import { useInspectorLayout } from './layout';
import { CompactSelect } from './select';

export function CompactSegmentedSelector<T extends string>(props: {
  ariaLabel: string;
  columns: 1 | 2 | 3 | 4 | 5;
  options: Array<{ disabled?: boolean; icon?: React.ReactNode; label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const inspector = useInspectorLayout();
  if (inspector) return <InspectorSegments {...props} />;
  return (
    <div
      role="group"
      data-ui="shared.ui.compact-inspector.segmented-row"
      aria-label={props.ariaLabel}
      className={cx('grid min-w-0 flex-1 gap-1.5', resolveCompactGridClassName(props.columns))}
    >
      {props.options.map((option) => (
        <SegmentedOption
          key={option.value}
          active={option.value === props.value}
          onChange={props.onChange}
          option={option}
        />
      ))}
    </div>
  );
}

/** Segments use intrinsic minimum widths before a full-width fit failure changes representation. */
function InspectorSegments<T extends string>(
  props: Parameters<typeof CompactSegmentedSelector<T>>[0]
) {
  const host = useRef<HTMLDivElement>(null);
  const [dropdown, setDropdown] = useState(false);
  const iconOnly = props.options.every((option) => option.icon !== undefined);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const fit = () => {
      if (
        !element.clientWidth ||
        element.matches(':focus-within') ||
        element.querySelector('[aria-expanded="true"]')
      )
        return;
      const context = document.createElement('canvas').getContext('2d');
      if (!context) return;
      context.font = `500 13px ${getComputedStyle(element).fontFamily}`;
      const width = props.options.reduce(
        (sum, option) => sum + context.measureText(option.label).width + 12,
        0
      );
      setDropdown(!iconOnly && width + 4 + 2 * (props.options.length - 1) > element.clientWidth);
    };
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(element);
    let disposed = false;
    void document.fonts?.ready.then(() => {
      if (!disposed) fit();
    });
    const afterBlur = () => queueMicrotask(fit);
    element.addEventListener('focusout', afterBlur);
    return () => {
      disposed = true;
      observer?.disconnect();
      element.removeEventListener('focusout', afterBlur);
    };
  }, [iconOnly, props.options]);
  return (
    <div ref={host} className="sniptale-property-choice">
      {dropdown ? (
        <CompactSelect
          aria-label={props.ariaLabel}
          value={props.value}
          options={props.options}
          appearance="plain"
          onChange={props.onChange}
        />
      ) : (
        <div
          role="group"
          aria-label={props.ariaLabel}
          data-ui="shared.ui.compact-inspector.segmented-row"
          data-icon-only={iconOnly ? 'true' : undefined}
          className="sniptale-property-segments"
          style={{
            gridTemplateColumns: `repeat(${props.options.length}, minmax(${iconOnly ? '0' : 'max-content'}, 1fr))`,
          }}
        >
          {props.options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-label={option.label}
              title={option.label}
              aria-pressed={option.value === props.value}
              disabled={option.disabled}
              onClick={() => props.onChange(option.value)}
            >
              {option.icon ?? option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SegmentedOption<T extends string>(props: {
  active: boolean;
  option: { disabled?: boolean; icon?: React.ReactNode; label: string; value: T };
  onChange: (value: T) => void;
}) {
  return (
    <ProductActionButton
      compact
      tone="toggle"
      active={props.active}
      className={[
        'min-w-0 !h-auto !min-h-10 !whitespace-normal !px-2 py-2 text-center',
        '!text-[length:var(--sniptale-compact-font-size,11px)] !leading-tight',
      ].join(' ')}
      aria-pressed={props.active}
      disabled={props.option.disabled === true}
      title={props.option.label}
      onClick={() => props.onChange(props.option.value)}
    >
      {props.option.icon ?? <span className="min-w-0 break-normal">{props.option.label}</span>}
    </ProductActionButton>
  );
}

export function OptionRowValue({ value }: { value?: React.ReactNode | undefined }) {
  if (!value) {
    return null;
  }

  return (
    <span
      className={[
        'text-[length:var(--sniptale-compact-font-size,12px)] font-semibold',
        'text-[color:var(--sniptale-color-text-muted)]',
      ].join(' ')}
    >
      {value}
    </span>
  );
}

export function OptionToggleIndicator({ active }: { active: boolean }) {
  return (
    <span
      data-state={active ? 'active' : 'inactive'}
      className={cx(
        'flex h-4 w-7 items-center rounded-full border p-[2px] transition',
        active
          ? [
              'justify-end border-[color:var(--sniptale-color-border-accent-strong)]',
              'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_18%,transparent)]',
            ].join(' ')
          : [
              'justify-start border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_86%,transparent)]',
              'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_72%,transparent)]',
            ].join(' ')
      )}
      aria-hidden="true"
    >
      <span
        className={cx(
          'flex h-3 w-3 items-center justify-center rounded-full transition',
          active
            ? 'bg-[color:var(--sniptale-color-accent)] text-[color:var(--sniptale-color-surface-panel)]'
            : 'bg-[color:var(--sniptale-color-text-muted)] opacity-55'
        )}
      >
        {active ? <Check size={9} strokeWidth={3} /> : null}
      </span>
    </span>
  );
}
