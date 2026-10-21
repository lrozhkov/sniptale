import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cx } from './shared';

const InspectorLayoutContext = React.createContext(false);

/** Enables the canonical parameter construction for a migrated inspector owner. */
export function InspectorLayout({ children }: { children: React.ReactNode }) {
  return <InspectorLayoutContext value>{children}</InspectorLayoutContext>;
}

export function useInspectorLayout() {
  return React.useContext(InspectorLayoutContext);
}

/** One geometry owner fits ordinary name/value rows before stacking the value. */
export function InspectorParameterRow(props: {
  label: string;
  labelAccessory?: React.ReactNode;
  labelModified?: boolean | undefined;
  children: React.ReactNode;
  valueMinimum?: number;
  valueText?: string | undefined;
  valueOptions?: readonly string[] | undefined;
  stacked?: boolean;
  keepInline?: boolean;
  className?: string | undefined;
  dataUi?: string;
  onActivate?(): void;
}) {
  const row = React.useRef<HTMLDivElement>(null);
  const name = React.useRef<HTMLSpanElement>(null);
  const hasLabelAccessory = Boolean(props.labelAccessory);
  const [stacked, setStacked] = React.useState(props.stacked ?? false);
  const fit = React.useCallback(() => {
    const element = row.current;
    const label = name.current;
    if (!element || !label || !element.clientWidth || props.stacked || props.keepInline) return;
    if (element.matches(':focus-within') || element.querySelector('[aria-expanded="true"]')) return;
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;
    context.font = getComputedStyle(label).font;
    const available = element.clientWidth - 16;
    const accessoryWidth = hasLabelAccessory
      ? (label.querySelector('[data-parameter-label-accessory]')?.getBoundingClientRect().width ??
        0)
      : 0;
    const labelWidth =
      context.measureText(props.label).width + (accessoryWidth ? accessoryWidth + 4 : 0);
    const valueWidth = Math.max(
      props.valueMinimum ?? 100,
      props.valueText ? context.measureText(props.valueText).width + 40 : 0,
      props.valueOptions?.length
        ? props.valueOptions.reduce(
            (width, text) => width + context.measureText(text).width + 12,
            0
          ) +
            4 +
            2 * (props.valueOptions.length - 1)
        : 0
    );
    setStacked(labelWidth > (available - 8) * 0.45 || valueWidth > (available - 8) * 0.55);
  }, [
    props.label,
    hasLabelAccessory,
    props.stacked,
    props.keepInline,
    props.valueMinimum,
    props.valueText,
    props.valueOptions,
  ]);
  React.useLayoutEffect(() => {
    fit();
    const element = row.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    let disposed = false;
    void document.fonts?.ready.then(() => {
      if (!disposed) fit();
    });
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [fit]);
  const isActivation = (target: EventTarget) =>
    target instanceof Element && !target.closest('button,input,textarea,select,a,[role="slider"]');
  return (
    <div
      ref={row}
      data-ui={props.dataUi}
      data-layout={props.stacked || stacked ? 'stacked' : 'inline'}
      data-activates={props.onActivate ? 'true' : undefined}
      className={cx('sniptale-parameter-row', props.className)}
      onBlurCapture={() => queueMicrotask(fit)}
      onPointerDown={(event) => {
        if (props.onActivate && event.button === 0 && isActivation(event.target))
          event.preventDefault();
      }}
      onClick={(event) => {
        const activate = props.onActivate;
        if (activate && isActivation(event.target)) {
          event.stopPropagation();
          activate();
        }
      }}
    >
      <span
        ref={name}
        title={props.label}
        className={cx(
          'sniptale-parameter-name',
          props.labelModified && '!text-[var(--sniptale-color-accent)]'
        )}
      >
        <span>{props.label}</span>
        {props.labelAccessory ? (
          <span data-parameter-label-accessory className="ml-1 inline-flex shrink-0">
            {props.labelAccessory}
          </span>
        ) : null}
      </span>
      <div className="sniptale-parameter-value">{props.children}</div>
    </div>
  );
}

export interface InspectorPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function InspectorPanel({ children, className, ...props }: InspectorPanelProps) {
  return (
    <div
      {...props}
      className={cx(
        'rounded-[14px] border p-3',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_92%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]',
        'text-[color:var(--sniptale-color-text-primary)]',
        className
      )}
    >
      {children}
    </div>
  );
}

export interface PanelHeaderProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

export function PanelHeader({ children, className, ...props }: PanelHeaderProps) {
  return (
    <h3
      {...props}
      className={cx(
        'm-0 text-[12px] font-bold uppercase leading-4',
        'text-[color:var(--sniptale-color-text-secondary)]',
        className
      )}
    >
      {children}
    </h3>
  );
}

export interface PanelSectionProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  label: React.ReactNode;
  value?: React.ReactNode;
}

export function PanelSection({ children, className, label, value, ...props }: PanelSectionProps) {
  return (
    <section
      {...props}
      className={cx(
        'rounded-[10px] border px-3 py-2',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
        className
      )}
    >
      <div className="flex min-h-6 items-center justify-between gap-3">
        <span className="min-w-0 text-[12px] font-semibold text-[color:var(--sniptale-color-text-secondary)]">
          {label}
        </span>
        {value === undefined ? null : (
          <span
            className={[
              'shrink-0 text-right text-[12px] font-semibold',
              'text-[color:var(--sniptale-color-text-primary)]',
            ].join(' ')}
          >
            {value}
          </span>
        )}
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
    </section>
  );
}

export interface CollapsibleSectionProps extends Omit<PanelSectionProps, 'children'> {
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CollapsibleSection({
  children,
  defaultOpen = true,
  label,
  onOpenChange,
  open,
  value,
  ...props
}: CollapsibleSectionProps) {
  const [localOpen, setLocalOpen] = React.useState(defaultOpen);
  const resolvedOpen = open ?? localOpen;
  const toggleOpen = () => {
    const nextOpen = !resolvedOpen;
    setLocalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <section {...props} className={cx('space-y-2', props.className)}>
      <button
        type="button"
        aria-expanded={resolvedOpen}
        className={cx(
          'flex min-h-9 w-full items-center justify-between gap-3 rounded-[10px] border px-3',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
          'text-left transition hover:border-[color:var(--sniptale-color-border-strong)]'
        )}
        onClick={toggleOpen}
      >
        <span className="flex min-w-0 items-center gap-2">
          {resolvedOpen ? (
            <ChevronDown size={14} strokeWidth={2.3} aria-hidden="true" />
          ) : (
            <ChevronRight size={14} strokeWidth={2.3} aria-hidden="true" />
          )}
          <span className="text-[12px] font-bold uppercase text-[color:var(--sniptale-color-text-secondary)]">
            {label}
          </span>
        </span>
        {value === undefined ? null : (
          <span className="shrink-0 text-[12px] font-semibold text-[color:var(--sniptale-color-accent)]">
            {value}
          </span>
        )}
      </button>
      {resolvedOpen ? <div className="space-y-2">{children}</div> : null}
    </section>
  );
}
