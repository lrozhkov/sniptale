import type React from 'react';
import { getControlSegmentedOptionClassName } from '../control-language';

export type SegmentedSwitchOption<TId extends string> = {
  id: TId;
  label: string;
  disabled?: boolean;
};

type SegmentedSwitchProps<TId extends string> = {
  activeId: TId;
  appearance?: 'default' | 'neutral';
  ariaLabel: string;
  dataAttribute?: Record<string, string>;
  density?: 'compact' | 'default';
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
        'flex min-w-0 flex-wrap gap-1 overflow-hidden border p-1',
        props.appearance === 'neutral' ? 'rounded-[6px]' : 'rounded-[10px]',
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
            disabled={option.disabled}
            title={option.label}
            onClick={() => props.onChange(option.id)}
            className={[
              props.appearance === 'neutral'
                ? getNeutralSegmentedOptionClassName(active)
                : getWrappedSegmentedOptionClassName(active),
              'relative z-10 min-w-fit max-w-full flex-auto justify-center overflow-hidden px-2 py-1.5',
              props.appearance === 'neutral' ? '!rounded-[6px]' : '!rounded-[7px]',
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
  const compact = props.density === 'compact';
  return (
    <div
      aria-label={props.ariaLabel}
      className={[
        'relative grid min-w-0 grid-flow-col overflow-hidden border',
        props.appearance === 'neutral'
          ? compact
            ? 'rounded-[6px] p-0.5'
            : 'rounded-[6px] p-1'
          : compact
            ? 'rounded-[8px] p-0.5'
            : 'rounded-[10px] p-1',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
      ].join(' ')}
      role="group"
      style={getSwitchStyle(props.options.length, props.activeIndex, compact)}
      {...props.dataAttribute}
    >
      <SegmentedSwitchActiveBackground compact={compact} neutral={props.appearance === 'neutral'} />
      {props.options.map((option) => (
        <InlineSegmentedSwitchOption
          key={option.id}
          active={option.id === props.activeId}
          compact={compact}
          neutral={props.appearance === 'neutral'}
          disabled={!!option.disabled}
          label={option.label}
          onClick={() => props.onChange(option.id)}
        />
      ))}
    </div>
  );
}

function InlineSegmentedSwitchOption(props: {
  active: boolean;
  disabled: boolean;
  compact: boolean;
  neutral: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      disabled={props.disabled}
      title={props.label}
      onClick={props.onClick}
      className={[
        props.neutral
          ? getNeutralSegmentedOptionClassName(false)
          : props.active
            ? getActiveSegmentedOptionClassName()
            : getControlSegmentedOptionClassName({ active: props.active, density: 'compact' }),
        'relative z-10 min-w-0 justify-center overflow-hidden px-2',
        props.compact ? '!h-7 !min-h-7 !rounded-[6px]' : '!h-8 !min-h-8',
        props.compact ? '' : props.neutral ? '!rounded-[6px]' : '!rounded-[7px]',
      ].join(' ')}
    >
      <span className="block min-w-0 max-w-full truncate">{props.label}</span>
    </button>
  );
}

function getNeutralSegmentedOptionClassName(active: boolean) {
  return [
    'inline-flex min-h-8 items-center gap-2 border-none px-2 text-[12px] font-normal leading-none',
    'text-[var(--sniptale-color-text-primary)] shadow-none outline-none transition-colors',
    active ? 'bg-[var(--sniptale-color-surface-hover)]' : 'bg-transparent',
    'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_45%,transparent)]',
    'focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
    'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
    'disabled:cursor-not-allowed disabled:opacity-55',
  ].join(' ');
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

function getSwitchStyle(groupCount: number, activeIndex: number, compact: boolean) {
  return {
    '--sniptale-group-count': groupCount,
    '--sniptale-group-index': activeIndex,
    '--sniptale-group-inset': compact ? '0.125rem' : '0.25rem',
    gridTemplateColumns: `repeat(${groupCount}, minmax(0, 1fr))`,
  } as React.CSSProperties;
}

function SegmentedSwitchActiveBackground(props: { compact: boolean; neutral: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'pointer-events-none absolute',
        props.compact ? 'bottom-0.5 top-0.5 rounded-[6px]' : 'bottom-1 top-1',
        props.compact ? '' : props.neutral ? 'rounded-[6px]' : 'rounded-[8px]',
        props.neutral
          ? 'bg-[var(--sniptale-color-surface-hover)] shadow-none'
          : [
              'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_78%,var(--sniptale-color-accent)_10%)]',
              'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_24%,transparent)]',
            ].join(' '),
        'transition-transform duration-200 ease-out motion-reduce:transition-none',
      ].join(' ')}
      style={{
        left: 'var(--sniptale-group-inset)',
        width: 'calc((100% - var(--sniptale-group-inset) * 2) / var(--sniptale-group-count))',
        transform: 'translateX(calc(var(--sniptale-group-index) * 100%))',
      }}
    />
  );
}
