import type { ReactNode } from 'react';
import { useInspectorLayout } from '../compact-inspector-controls/layout';

export function HighlighterManualInspectorSurface(props: { children: ReactNode }) {
  const inspector = useInspectorLayout();
  return (
    <div
      className={[
        'overflow-hidden border border-solid border-[var(--sniptale-color-border-soft)]',
        inspector ? 'rounded-[4px]' : 'rounded-[12px]',
      ].join(' ')}
      data-ui="shared.highlighter-manual-inspector-surface"
    >
      {props.children}
    </div>
  );
}
