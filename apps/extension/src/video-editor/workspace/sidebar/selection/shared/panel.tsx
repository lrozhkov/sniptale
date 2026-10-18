import type { ReactNode } from 'react';
import { StatusRow } from '../../../../../ui/compact-inspector-controls';
import { useInspectorLayout } from '../../../../../ui/compact-inspector-controls/layout';

export const PANEL_SECTION_CLASS_NAME = 'space-y-3';

export const PANEL_META_CLASS_NAME =
  'text-[length:var(--sniptale-compact-font-size,12px)] text-[var(--sniptale-color-text-secondary)]';
export const PANEL_DIVIDER_CLASS_NAME =
  'border-t border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_58%,transparent)]';

export function DetailList({ children }: { children: ReactNode }) {
  return <div className="space-y-1">{children}</div>;
}

export function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  const inspector = useInspectorLayout();
  if (inspector) return <StatusRow label={label} value={value} />;
  return (
    <div
      className="grid grid-cols-2 items-baseline gap-3 border-b
        border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_34%,transparent)]
        py-1.5 last:border-b-0"
    >
      <span
        className="min-w-0 break-words font-medium text-[length:var(--sniptale-compact-font-size,12px)]
          text-[var(--sniptale-color-text-secondary)]"
      >
        {label}
      </span>
      <span
        className="min-w-0 break-words font-medium text-right text-[length:var(--sniptale-compact-font-size,12px)]
          text-[var(--sniptale-color-text-primary)]"
      >
        {value}
      </span>
    </div>
  );
}
