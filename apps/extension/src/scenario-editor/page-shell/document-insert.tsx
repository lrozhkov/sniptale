import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { FileText, Heading, ListPlus, MessageSquare } from 'lucide-react';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';

type InsertTarget =
  | { kind: 'item'; beforeItemId?: string }
  | { kind: 'block'; itemId: string; beforeBlockId?: string };

/** A boundary command uses stable document identities and the existing mutation owner. */
export function GuideDocumentInsert({
  target,
  end = false,
  disabled,
  onOperate,
  t,
}: {
  target: InsertTarget;
  end?: boolean;
  disabled: boolean;
  onOperate: (operation: GuideStructureOperation) => void;
  t: Translate;
}) {
  const before = target.kind === 'item' ? target.beforeItemId : target.beforeBlockId;
  const items =
    target.kind === 'item'
      ? [
          {
            label: t('scenario.editor.guideAddStep'),
            icon: <ListPlus size={15} aria-hidden="true" />,
            onSelect: () =>
              onOperate({
                kind: 'add-step',
                ...(before === undefined ? {} : { beforeItemId: before }),
              }),
          },
          {
            label: t('scenario.editor.guideAddSection'),
            icon: <Heading size={15} aria-hidden="true" />,
            onSelect: () =>
              onOperate({
                kind: 'add-section',
                ...(before === undefined ? {} : { beforeItemId: before }),
              }),
          },
        ]
      : [
          {
            kind: 'text' as const,
            label: t('scenario.editor.guideAddText'),
            icon: <FileText size={15} aria-hidden="true" />,
          },
          {
            kind: 'heading' as const,
            label: t('scenario.editor.guideAddHeading'),
            icon: <Heading size={15} aria-hidden="true" />,
          },
          {
            kind: 'note' as const,
            label: t('scenario.editor.guideAddNote'),
            icon: <MessageSquare size={15} aria-hidden="true" />,
          },
        ].map((item) => ({
          ...item,
          onSelect: () =>
            onOperate({
              kind: 'add-block',
              itemId: target.itemId,
              blockKind: item.kind,
              ...(before === undefined ? {} : { beforeBlockId: before }),
            }),
        }));
  return (
    <div
      className={`guide-insertion guide-insertion-${target.kind}`}
      data-end={end}
      data-insert-before={before ?? 'end'}
    >
      <div className="guide-insertion-chrome">
        {items.map((item) => (
          <ContentToolbarButton
            key={item.label}
            type="button"
            title={item.label}
            aria-label={item.label}
            disabled={disabled}
            onClick={item.onSelect}
          >
            {item.icon}
          </ContentToolbarButton>
        ))}
      </div>
    </div>
  );
}
