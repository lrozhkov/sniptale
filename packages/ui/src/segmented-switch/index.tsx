import type React from 'react';
import { getControlSegmentedOptionClassName } from '../control-language';

export type SegmentedSwitchOption<TId extends string> = {
  id: TId;
  label: string;
};

type SegmentedSwitchProps<TId extends string> = {
  activeId: TId;
  ariaLabel: string;
  dataAttribute?: Record<string, string>;
  options: readonly SegmentedSwitchOption<TId>[];
  wrap?: boolean;
  onChange: (id: TId) => void;
};

export function SegmentedSwitch<TId extends string>(props: SegmentedSwitchProps<TId>) {
  if (props.options.length < 2) {
    return null;
  }

  const activeIndex = Math.max(
    0,
    props.options.findIndex((option) => option.id === props.activeId)
  );

  if (props.wrap) {
    return <WrappedSegmentedSwitch {...props} />;
  }

  return <InlineSegmentedSwitch {...props} activeIndex={activeIndex} />;
}

function WrappedSegmentedSwitch<TId extends string>(props: SegmentedSwitchProps<TId>) {
  return (
    <div
      aria-label={props.ariaLabel}
      className={[
        'flex min-w-0 flex-wrap gap-1 overflow-hidden rounded-[10px] border p-1',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
      ].join(' ')}
      role="group"
      {...props.dataAttribute}
    >
      {props.options.map((option) => {
        const active = option.id === props.activeId;

        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            title={option.label}
            onClick={() => props.onChange(option.id)}
            className={[
              getWrappedSegmentedOptionClassName(active),
              'relative z-10 min-w-[4.25rem] flex-1 justify-center overflow-hidden !rounded-[7px] px-2 py-1.5',
            ].join(' ')}
          >
            <span className="block min-w-0 max-w-full whitespace-normal text-center leading-tight">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function InlineSegmentedSwitch<TId extends string>(
  props: SegmentedSwitchProps<TId> & { activeIndex: number }
) {
  return (
    <div
      aria-label={props.ariaLabel}
      className={[
        'relative grid min-w-0 grid-flow-col overflow-hidden rounded-[10px] border p-1',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
      ].join(' ')}
      role="group"
      style={getSwitchStyle(props.options.length, props.activeIndex)}
      {...props.dataAttribute}
    >
      <SegmentedSwitchActiveBackground />
      {props.options.map((option) => (
        <InlineSegmentedSwitchOption
          key={option.id}
          active={option.id === props.activeId}
          label={option.label}
          onClick={() => props.onChange(option.id)}
        />
      ))}
    </div>
  );
}

function InlineSegmentedSwitchOption(props: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      title={props.label}
      onClick={props.onClick}
      className={[
        props.active
          ? getActiveSegmentedOptionClassName()
          : getControlSegmentedOptionClassName({ active: props.active, density: 'compact' }),
        'relative z-10 min-w-0 justify-center overflow-hidden !h-8 !min-h-8 !rounded-[7px] px-2',
      ].join(' ')}
    >
      <span className="block min-w-0 max-w-full truncate">{props.label}</span>
    </button>
  );
}

function getWrappedSegmentedOptionClassName(active: boolean) {
  if (!active) {
    return getControlSegmentedOptionClassName({ active, density: 'compact' });
  }
  return [
    'inline-flex min-h-8 items-center gap-2 whitespace-normal',
    'border-none',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_78%,var(--sniptale-color-accent)_10%)]',
    'text-[12px] font-semibold text-[var(--sniptale-color-text-primary)]',
    'shadow-none outline-none',
    'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_24%,transparent)]',
    'transition-all duration-150 focus-visible:outline-none',
    'focus-visible:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_24%,transparent)]',
    'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none',
  ].join(' ');
}

function getActiveSegmentedOptionClassName() {
  return [
    'inline-flex h-8 min-h-8 items-center justify-center gap-2 whitespace-nowrap',
    'rounded-[7px] border-none bg-transparent px-3 text-[12px] font-semibold leading-none',
    'text-[var(--sniptale-color-text-primary)] shadow-none outline-none',
    'transition-all duration-150 focus-visible:outline-none',
    'focus-visible:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_24%,transparent)]',
    'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none',
  ].join(' ');
}

function getSwitchStyle(groupCount: number, activeIndex: number) {
  return {
    '--sniptale-group-count': groupCount,
    '--sniptale-group-index': activeIndex,
    gridTemplateColumns: `repeat(${groupCount}, minmax(0, 1fr))`,
  } as React.CSSProperties;
}

function SegmentedSwitchActiveBackground() {
  return (
    <span
      aria-hidden="true"
      className={[
        'pointer-events-none absolute bottom-1 top-1 rounded-[8px]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_78%,var(--sniptale-color-accent)_10%)]',
        'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_24%,transparent)]',
        'transition-transform duration-200 ease-out motion-reduce:transition-none',
      ].join(' ')}
      style={{
        left: '0.25rem',
        width: 'calc((100% - 0.5rem) / var(--sniptale-group-count))',
        transform: 'translateX(calc(var(--sniptale-group-index) * 100%))',
      }}
    />
  );
}
