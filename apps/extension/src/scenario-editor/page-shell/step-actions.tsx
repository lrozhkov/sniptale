import { ArrowUp, ArrowDown, Copy, Merge, MoreHorizontal, Trash2 } from 'lucide-react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import { GuideActionMenu } from './action-menu';

/** Item commands stay next to their document item; appearance remains in the inspector. */
export function GuideStepActions({
  project,
  itemId,
  disabled,
  onOperate,
  t,
}: {
  project: GuideProject;
  itemId: string;
  disabled: boolean;
  onOperate: (operation: GuideStructureOperation) => void;
  t: Translate;
}) {
  const index = project.items.findIndex((item) => item.id === itemId);
  const item = project.items[index];
  if (!item) return null;
  return (
    <div className="guide-item-actions">
      <GuideActionMenu
        label={t('scenario.editor.guideStepActions')}
        icon={<MoreHorizontal size={16} aria-hidden="true" />}
        disabled={disabled}
        items={[
          {
            label: t('scenario.editor.guideMoveUp'),
            icon: <ArrowUp size={15} aria-hidden="true" />,
            disabled: index === 0,
            onSelect: () => onOperate({ kind: 'move-item', itemId, direction: -1 }),
          },
          {
            label: t('scenario.editor.guideMoveDown'),
            icon: <ArrowDown size={15} aria-hidden="true" />,
            disabled: index === project.items.length - 1,
            onSelect: () => onOperate({ kind: 'move-item', itemId, direction: 1 }),
          },
          {
            label: t('scenario.editor.guideDuplicateItem'),
            icon: <Copy size={15} aria-hidden="true" />,
            onSelect: () => onOperate({ kind: 'duplicate-item', itemId }),
          },
          ...(item.kind === 'step'
            ? [
                {
                  label: t('scenario.editor.guideMergeNext'),
                  icon: <Merge size={15} aria-hidden="true" />,
                  disabled: project.items[index + 1]?.kind !== 'step',
                  onSelect: () => onOperate({ kind: 'merge-next', itemId }),
                },
              ]
            : []),
          {
            label: t('scenario.editor.guideRemoveItem'),
            icon: <Trash2 size={15} aria-hidden="true" />,
            danger: true,
            onSelect: () => onOperate({ kind: 'remove-item', itemId }),
          },
        ]}
      />
    </div>
  );
}
