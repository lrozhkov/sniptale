import { ArrowDown, ArrowUp, Copy, Split, Trash2 } from 'lucide-react';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';

/** Block actions share the same semantic mutation path for pointer and keyboard activation. */
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
    <div
      className="guide-block-actions"
      role="group"
      aria-label={t('scenario.editor.guideBlockActions')}
    >
      <button
        type="button"
        disabled={disabled || index === 0}
        title={t('scenario.editor.guideMoveUp')}
        aria-label={t('scenario.editor.guideMoveUp')}
        onClick={() => onOperate({ kind: 'move-block', itemId, blockId, direction: -1 })}
      >
        <ArrowUp size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={disabled || index === count - 1}
        title={t('scenario.editor.guideMoveDown')}
        aria-label={t('scenario.editor.guideMoveDown')}
        onClick={() => onOperate({ kind: 'move-block', itemId, blockId, direction: 1 })}
      >
        <ArrowDown size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={disabled}
        title={t('scenario.editor.guideDuplicateBlock')}
        aria-label={t('scenario.editor.guideDuplicateBlock')}
        onClick={() => onOperate({ kind: 'duplicate-block', itemId, blockId })}
      >
        <Copy size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={disabled || index === 0}
        title={t('scenario.editor.guideSplitHere')}
        aria-label={t('scenario.editor.guideSplitHere')}
        onClick={() => onOperate({ kind: 'split-step', itemId, blockId })}
      >
        <Split size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={disabled}
        title={t('scenario.editor.guideRemoveBlock')}
        aria-label={t('scenario.editor.guideRemoveBlock')}
        onClick={() => onOperate({ kind: 'remove-block', itemId, blockId })}
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
