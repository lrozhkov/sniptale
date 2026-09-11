import { ArrowUp, ArrowDown, Copy, Merge, Trash2 } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';

/** Controls only the selected document item; project lifecycle actions remain separate. */
export function GuideStepActions({
  project,
  selectedId,
  disabled,
  onChange,
  onOperate,
  t,
}: {
  project: GuideProject;
  selectedId: string | null;
  disabled: boolean;
  onChange: (project: GuideProject, group?: string | null) => void;
  onOperate: (operation: GuideStructureOperation) => void;
  t: Translate;
}) {
  const index = project.items.findIndex((item) => item.id === selectedId);
  const item = project.items[index];
  if (!item) return null;
  const changeItem = (next: typeof item, group?: string) =>
    onChange(
      { ...project, items: project.items.map((entry) => (entry.id === item.id ? next : entry)) },
      group
    );
  return (
    <div className="guide-step-actions">
      {item.kind === 'step' ? (
        <label className="guide-number-toggle">
          <input
            type="checkbox"
            disabled={disabled}
            checked={item.showNumber}
            onChange={(event) => changeItem({ ...item, showNumber: event.target.checked })}
          />
          {t('scenario.editor.guideShowNumber')}
        </label>
      ) : null}
      <div role="group" aria-label={t('scenario.editor.guideStepActions')}>
        <ProductActionButton
          tone="secondary"
          compact
          type="button"
          disabled={disabled || index === 0}
          onClick={() => onOperate({ kind: 'move-item', itemId: item.id, direction: -1 })}
        >
          <ArrowUp size={15} aria-hidden="true" />
          {t('scenario.editor.guideMoveUp')}
        </ProductActionButton>
        <ProductActionButton
          tone="secondary"
          compact
          type="button"
          disabled={disabled || index === project.items.length - 1}
          onClick={() => onOperate({ kind: 'move-item', itemId: item.id, direction: 1 })}
        >
          <ArrowDown size={15} aria-hidden="true" />
          {t('scenario.editor.guideMoveDown')}
        </ProductActionButton>
        <ProductActionButton
          tone="secondary"
          compact
          type="button"
          disabled={disabled}
          onClick={() => onOperate({ kind: 'duplicate-item', itemId: item.id })}
        >
          <Copy size={15} aria-hidden="true" />
          {t('scenario.editor.guideDuplicateItem')}
        </ProductActionButton>
        {item.kind === 'step' && (
          <ProductActionButton
            tone="secondary"
            compact
            type="button"
            disabled={disabled || project.items[index + 1]?.kind !== 'step'}
            onClick={() => onOperate({ kind: 'merge-next', itemId: item.id })}
          >
            <Merge size={15} aria-hidden="true" />
            {t('scenario.editor.guideMergeNext')}
          </ProductActionButton>
        )}
        <ProductActionButton
          tone="danger"
          compact
          type="button"
          disabled={disabled}
          onClick={() => onOperate({ kind: 'remove-item', itemId: item.id })}
        >
          <Trash2 size={15} aria-hidden="true" />
          {t('scenario.editor.guideRemoveItem')}
        </ProductActionButton>
      </div>
    </div>
  );
}
