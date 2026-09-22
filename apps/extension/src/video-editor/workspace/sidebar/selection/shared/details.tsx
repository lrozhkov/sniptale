import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export function InspectorDetails(props: { label: string; children: ReactNode }) {
  return (
    <details
      className="group/inspector-details border-t
      border-[var(--sniptale-color-border-subtle)] pt-2 text-xs"
    >
      <summary
        className="flex items-center gap-2 list-none cursor-pointer py-1 [&::-webkit-details-marker]:hidden
        text-[var(--sniptale-color-text-secondary)]
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-accent)]"
      >
        <ChevronRight
          size={14}
          aria-hidden="true"
          className="shrink-0 group-open/inspector-details:rotate-90"
        />
        <span>{props.label}</span>
      </summary>
      <div className="space-y-2 pt-2">{props.children}</div>
    </details>
  );
}
