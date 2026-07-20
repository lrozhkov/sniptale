import type { ReactNode } from 'react';
import { Heading1, ImagePlus, Minus, StickyNote } from 'lucide-react';
import { translate } from '../../platform/i18n';

export function InsertStepActions(props: {
  index: number;
  onInsertImage: (index: number) => void;
  onInsert: (index: number, kind: 'section' | 'note' | 'divider') => void;
}) {
  return (
    <div className="group flex items-center gap-2 py-3">
      <div className="h-px flex-1 border-t border-dashed border-[var(--sniptale-color-border-soft)]" />
      <InsertStepActionButton
        icon={<ImagePlus className="h-3.5 w-3.5" />}
        label={translate('scenario.editor.addImage')}
        onClick={() => props.onInsertImage(props.index)}
      />
      <InsertStepActionButton
        icon={<Heading1 className="h-3.5 w-3.5" />}
        label={translate('scenario.editor.addSection')}
        onClick={() => props.onInsert(props.index, 'section')}
      />
      <InsertStepActionButton
        icon={<StickyNote className="h-3.5 w-3.5" />}
        label={translate('scenario.editor.addNote')}
        onClick={() => props.onInsert(props.index, 'note')}
      />
      <InsertStepActionButton
        icon={<Minus className="h-3.5 w-3.5" />}
        label={translate('scenario.editor.addDivider')}
        onClick={() => props.onInsert(props.index, 'divider')}
      />
      <div className="h-px flex-1 border-t border-dashed border-[var(--sniptale-color-border-soft)]" />
    </div>
  );
}

function InsertStepActionButton(props: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.label}
      aria-label={props.label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border
        border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]
        text-[var(--sniptale-color-text-secondary)] opacity-0 transition group-hover:opacity-100"
    >
      {props.icon}
    </button>
  );
}
