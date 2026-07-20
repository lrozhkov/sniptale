import type { ReactNode } from 'react';

export const PANEL_SECTION_CLASS_NAME = 'space-y-3';

export const PANEL_HEADING_CLASS_NAME =
  'text-sm font-semibold text-[var(--sniptale-color-text-primary)]';
export const PANEL_META_CLASS_NAME =
  'text-xs uppercase tracking-[0.12em] text-[var(--sniptale-color-text-muted)]';
export const PANEL_DIVIDER_CLASS_NAME =
  'border-t border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_58%,transparent)]';

export function DetailList({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}

export function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 border-b
        border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_34%,transparent)]
        py-1.5 last:border-b-0"
    >
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.14em]
          text-[var(--sniptale-color-text-muted-strong)]"
      >
        {label}
      </span>
      <span className="text-right text-sm text-[var(--sniptale-color-text-primary)]">{value}</span>
    </div>
  );
}
