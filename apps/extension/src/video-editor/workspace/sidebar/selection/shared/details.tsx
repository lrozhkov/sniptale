import type { ReactNode } from 'react';

export function InspectorDetails(props: { label: string; children: ReactNode }) {
  return (
    <details
      className="group/inspector-details border-t
      border-[var(--sniptale-color-border-subtle)] pt-2 text-xs"
    >
      <summary
        className="cursor-pointer py-1 text-[var(--sniptale-color-text-secondary)]
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-accent)]"
      >
        {props.label}
      </summary>
      <div className="space-y-2 pt-2">{props.children}</div>
    </details>
  );
}
