import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  createGuideParagraphs,
  type GuideStructureOperation,
} from '../../features/scenario/project/public';
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
      ) : (
        <>
          <label>
            {t('scenario.editor.guideSectionTitle')}
            <input
              disabled={disabled}
              maxLength={GUIDE_LIMITS.maxLabelLength}
              value={item.title}
              onChange={(event) =>
                changeItem({ ...item, title: event.target.value }, `section-title:${item.id}`)
              }
            />
          </label>
          <label>
            {t('scenario.editor.body')}
            <textarea
              disabled={disabled}
              rows={3}
              value={item.paragraphs
                .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
                .join('\n')}
              onChange={(event) =>
                changeItem(
                  { ...item, paragraphs: createGuideParagraphs(event.target.value) },
                  `section-body:${item.id}`
                )
              }
            />
          </label>
        </>
      )}
      <div role="group" aria-label={t('scenario.editor.guideStepActions')}>
        <button
          type="button"
          disabled={disabled || index === 0}
          onClick={() => onOperate({ kind: 'move-item', itemId: item.id, direction: -1 })}
        >
          {t('scenario.editor.guideMoveUp')}
        </button>
        <button
          type="button"
          disabled={disabled || index === project.items.length - 1}
          onClick={() => onOperate({ kind: 'move-item', itemId: item.id, direction: 1 })}
        >
          {t('scenario.editor.guideMoveDown')}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onOperate({ kind: 'duplicate-item', itemId: item.id })}
        >
          {t('scenario.editor.guideDuplicateItem')}
        </button>
        {item.kind === 'step' && (
          <button
            type="button"
            disabled={disabled || project.items[index + 1]?.kind !== 'step'}
            onClick={() => onOperate({ kind: 'merge-next', itemId: item.id })}
          >
            {t('scenario.editor.guideMergeNext')}
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onOperate({ kind: 'remove-item', itemId: item.id })}
        >
          {t('scenario.editor.guideRemoveItem')}
        </button>
      </div>
    </div>
  );
}
