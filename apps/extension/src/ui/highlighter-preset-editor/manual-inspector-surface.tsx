import type { ReactNode } from 'react';

export function HighlighterManualInspectorSurface(props: { children: ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-[12px] border border-[var(--sniptale-color-border-soft)]"
      data-ui="shared.highlighter-manual-inspector-surface"
    >
      {props.children}
    </div>
  );
}
