import { ArrowUp, ArrowDown, Copy, Merge, MoreHorizontal, Trash2 } from 'lucide-react';
import { memo } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import { GuideActionMenu } from './action-menu';

type GuideStepActionsProps = {
  project: GuideProject;
  itemId: string;
  disabled: boolean;
  tone?: 'default' | 'utility';
  onOperate: (operation: GuideStructureOperation) => void;
  t: Translate;
};

/** Item commands stay next to their document item; appearance remains in the inspector. */
export function GuideStepActions({ project, ...props }: GuideStepActionsProps) {
  const { itemId } = props;
  const index = project.items.findIndex((item) => item.id === itemId);
  const item = project.items[index];
  if (!item || project.purpose === 'step-template') return null;
  return (
    <GuideItemActions
      {...props}
      itemKind={item.kind}
      canMoveUp={index > 0}
      canMoveDown={index < project.items.length - 1}
      canMergeNext={project.items[index + 1]?.kind === 'step'}
    />
  );
}

const GuideItemActions = memo(function GuideItemActions({
  itemId,
  itemKind,
  canMoveUp,
  canMoveDown,
  canMergeNext,
  disabled,
  tone = 'default',
  onOperate,
  t,
}: Omit<GuideStepActionsProps, 'project'> & {
  itemKind: GuideProject['items'][number]['kind'];
  canMoveUp: boolean;
  canMoveDown: boolean;
  canMergeNext: boolean;
}) {
  return (
    <div className="guide-item-actions">
      <GuideActionMenu
        label={t(
          itemKind === 'section'
            ? 'scenario.editor.guideSectionActions'
            : 'scenario.editor.guideStepActions'
        )}
        tone={tone}
        icon={<MoreHorizontal size={16} aria-hidden="true" />}
        disabled={disabled}
        items={[
          {
            label: t('scenario.editor.guideMoveUp'),
            icon: <ArrowUp size={15} aria-hidden="true" />,
            disabled: !canMoveUp,
            onSelect: () => onOperate({ kind: 'move-item', itemId, direction: -1 }),
          },
          {
            label: t('scenario.editor.guideMoveDown'),
            icon: <ArrowDown size={15} aria-hidden="true" />,
            disabled: !canMoveDown,
            onSelect: () => onOperate({ kind: 'move-item', itemId, direction: 1 }),
          },
          {
            label: t('scenario.editor.guideDuplicateItem'),
            icon: <Copy size={15} aria-hidden="true" />,
            onSelect: () => onOperate({ kind: 'duplicate-item', itemId }),
          },
          ...(itemKind === 'step'
            ? [
                {
                  label: t('scenario.editor.guideMergeNext'),
                  icon: <Merge size={15} aria-hidden="true" />,
                  disabled: !canMergeNext,
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
});
