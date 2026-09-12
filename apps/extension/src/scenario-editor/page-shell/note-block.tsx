import { GuideVoiceField } from './voice-field';
import { Check, Info, StickyNote, TriangleAlert, CircleAlert } from 'lucide-react';
import type { GuideBlock } from '@sniptale/runtime-contracts/scenario/types/guide';
import { createGuideParagraphs } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import { guideTextAppearance } from './document-appearance';
import { GuideActionMenu } from './action-menu';

type NoteBlock = Extract<GuideBlock, { kind: 'note' }>;
export const guideNoteTypes = [
  { tone: 'neutral', key: 'scenario.editor.guideNoteNeutral', icon: StickyNote },
  { tone: 'info', key: 'scenario.editor.guideNoteInfo', icon: Info },
  { tone: 'warning', key: 'scenario.editor.guideNoteWarning', icon: TriangleAlert },
  { tone: 'error', key: 'scenario.editor.guideNoteError', icon: CircleAlert },
] as const;

/** Edits existing note content and tone without owning document state. */
export function GuideNoteBlock({
  block,
  disabled,
  onChange,
  t,
}: {
  block: NoteBlock;
  disabled: boolean;
  onChange: (block: GuideBlock, group?: string | null) => void;
  t: Translate;
}) {
  const current = guideNoteTypes.find((type) => type.tone === block.tone)!;
  const Icon = current.icon;
  return (
    <aside
      className="guide-note-callout"
      data-tone={block.tone}
      role="note"
      aria-label={t(current.key)}
    >
      <GuideActionMenu
        label={t('scenario.editor.guideNoteType')}
        icon={<Icon size={16} aria-hidden="true" />}
        disabled={disabled}
        items={guideNoteTypes.map((type) => ({
          label: t(type.key),
          icon:
            type.tone === block.tone ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <type.icon size={16} aria-hidden="true" />
            ),
          onSelect: () => {
            if (type.tone !== block.tone) onChange({ ...block, tone: type.tone }, null);
          },
        }))}
      />
      <GuideVoiceField
        aria-label={t('scenario.editor.guideNoteText')}
        placeholder={t('scenario.editor.guideNoteText')}
        disabled={disabled}
        className="guide-note"
        style={guideTextAppearance(block)}
        rows={1}
        value={block.paragraphs
          .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
          .join('\n')}
        onValueChange={(value) => onChange({ ...block, paragraphs: createGuideParagraphs(value) })}
      />
    </aside>
  );
}
