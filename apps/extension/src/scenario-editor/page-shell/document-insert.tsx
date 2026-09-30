import { FileText, Heading, Image, ListPlus, MessageSquare, CornerDownLeft } from 'lucide-react';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import { GuideInsertActions } from './insert-actions';

type InsertTarget =
  | { kind: 'item'; beforeItemId?: string }
  | { kind: 'block'; itemId: string; beforeBlockId?: string };

/** A boundary command uses stable document identities and the existing mutation owner. */
export function GuideDocumentInsert({
  target,
  end = false,
  rowStart,
  disabled,
  onOperate,
  t,
}: {
  target: InsertTarget;
  end?: boolean;
  rowStart?: boolean;
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
            kind: 'image-slot' as const,
            label: t('scenario.editor.guideAddImage'),
            icon: <Image size={15} aria-hidden="true" />,
          },
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
  const rowStartItem =
    target.kind === 'block' && target.beforeBlockId && rowStart !== undefined
      ? {
          label: t(
            rowStart ? 'scenario.editor.guideRemoveRowStart' : 'scenario.editor.guideRowStart'
          ),
          icon: <CornerDownLeft size={15} aria-hidden="true" />,
          pressed: rowStart,
          onSelect: () =>
            onOperate({
              kind: 'set-row-start',
              itemId: target.itemId,
              blockId: target.beforeBlockId!,
              rowStart: !rowStart,
            }),
        }
      : null;
  return (
    <div
      className={`guide-insertion guide-insertion-${target.kind}`}
      data-end={end}
      data-insert-before={before ?? 'end'}
    >
      <div className="guide-insertion-chrome">
        <GuideInsertActions
          label={t(
            target.kind === 'item'
              ? 'scenario.editor.guideInsertItem'
              : 'scenario.editor.guideAddBlock'
          )}
          items={rowStartItem ? [...items, rowStartItem] : items}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
