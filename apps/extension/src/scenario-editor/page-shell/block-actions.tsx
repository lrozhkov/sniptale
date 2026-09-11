import { FloatingChromeToolbar } from '@sniptale/ui/floating-chrome';
import { ArrowDown, ArrowUp, Copy, MoreHorizontal, Split, Trash2 } from 'lucide-react';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import { GuideActionMenu } from './action-menu';

/** Block commands publish through the same reversible structural mutation path. */
export function GuideBlockActions({
  itemId,
  blockId,
  index,
  count,
  disabled,
  onOperate,
  t,
}: {
  itemId: string;
  blockId: string;
  index: number;
  count: number;
  disabled: boolean;
  onOperate: (operation: GuideStructureOperation) => void;
  t: Translate;
}) {
  return (
    <FloatingChromeToolbar className="guide-block-actions">
      <GuideActionMenu
        label={t('scenario.editor.guideBlockActions')}
        icon={<MoreHorizontal size={16} aria-hidden="true" />}
        disabled={disabled}
        items={[
          {
            label: t('scenario.editor.guideMoveUp'),
            icon: <ArrowUp size={15} aria-hidden="true" />,
            disabled: index === 0,
            onSelect: () => onOperate({ kind: 'move-block', itemId, blockId, direction: -1 }),
          },
          {
            label: t('scenario.editor.guideMoveDown'),
            icon: <ArrowDown size={15} aria-hidden="true" />,
            disabled: index === count - 1,
            onSelect: () => onOperate({ kind: 'move-block', itemId, blockId, direction: 1 }),
          },
          {
            label: t('scenario.editor.guideDuplicateBlock'),
            icon: <Copy size={15} aria-hidden="true" />,
            onSelect: () => onOperate({ kind: 'duplicate-block', itemId, blockId }),
          },
          {
            label: t('scenario.editor.guideSplitHere'),
            icon: <Split size={15} aria-hidden="true" />,
            disabled: index === 0,
            onSelect: () => onOperate({ kind: 'split-step', itemId, blockId }),
          },
          {
            label: t('scenario.editor.guideRemoveBlock'),
            icon: <Trash2 size={15} aria-hidden="true" />,
            danger: true,
            onSelect: () => onOperate({ kind: 'remove-block', itemId, blockId }),
          },
        ]}
      />
    </FloatingChromeToolbar>
  );
}
