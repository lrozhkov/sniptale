import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cx } from './shared';

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
