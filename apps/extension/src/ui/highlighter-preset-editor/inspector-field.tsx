import type { ReactNode } from 'react';
import { TextWithOverflowHint } from '../compact-inspector-controls/overflow-hint';

export function HighlighterPresetPropertyField(props: {
  children: ReactNode;
  compactLabel?: boolean;
  label: string;
}) {
  return (
    <div
      data-ui="shared.highlighter-preset-editor.property-field"
      data-field-label={props.label}
      className={`grid min-w-0 items-center gap-2 ${
        props.compactLabel ? 'grid-cols-[4rem_minmax(0,1fr)]' : 'grid-cols-[7.5rem_minmax(0,1fr)]'
      }`}
    >
      <TextWithOverflowHint
        className="truncate text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]"
        text={props.label}
      />
      <div className="min-w-0">{props.children}</div>
    </div>
  );
}
