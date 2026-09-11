import { Copy, FolderOpen, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { GUIDE_LIMITS, type GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { GuideSavedHistory } from './saved-history';
import type { useGuidePageState } from './runtime/use-state';

export function GuideProjectActions({
  project,
  disabled,
  status,
  onRestore,
  onClearHistory,
  onDuplicate,
  onDelete,
  onReload,
  t,
}: {
  project: GuideProject;
  disabled: boolean;
  status: ReturnType<typeof useGuidePageState>['status'];
  onRestore: (revision: number) => Promise<boolean>;
  onClearHistory: () => Promise<boolean>;
  onDuplicate: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onReload: () => Promise<void>;
  t: Translate;
}) {
  const [confirmation, setConfirmation] = useState<'delete' | 'reload' | null>(null);
  const hasUnsavedChanges = status === 'dirty' || status === 'failed' || status === 'conflict';
  const copy = () => {
    const pattern = t('scenario.editor.guideCopyName');
    const available = GUIDE_LIMITS.maxLabelLength - pattern.replace('{name}', '').length;
    void onDuplicate(pattern.replace('{name}', project.name.slice(0, available)));
  };
  const confirm = async () => {
    if (confirmation === 'delete') await onDelete();
    else if (confirmation === 'reload') await onReload();
    setConfirmation(null);
  };
  return (
    <div role="group" aria-label={t('scenario.editor.projectLabel')}>
      <GuideSavedHistory
        key={project.id}
        project={project}
        disabled={disabled || status === 'conflict'}
        onRestore={onRestore}
        onClearHistory={onClearHistory}
        canClearHistory={status === 'ready' || status === 'saved'}
        t={t}
      />
      <ProductActionButton
        tone="secondary"
        compact
        type="button"
        disabled={disabled}
        onClick={copy}
      >
        <Copy size={15} aria-hidden="true" />
        {t('scenario.editor.guideDuplicate')}
      </ProductActionButton>
      <ProductActionButton
        tone="secondary"
        compact
        type="button"
        disabled={disabled}
        onClick={() => {
          if (hasUnsavedChanges) setConfirmation('reload');
          else void onReload();
        }}
      >
        <FolderOpen size={15} aria-hidden="true" />
        {t('scenario.editor.guideReload')}
      </ProductActionButton>
      <ProductActionButton
        tone="secondary"
        compact
        type="button"
        disabled={disabled}
        onClick={() => setConfirmation('delete')}
        className="text-[var(--sniptale-color-danger)]"
      >
        <Trash2 size={15} aria-hidden="true" />
        {t('scenario.editor.guideDelete')}
      </ProductActionButton>
      <ProductConfirmDialog
        isOpen={confirmation !== null}
        isLoading={disabled}
        title={t(
          confirmation === 'delete' ? 'scenario.editor.guideDelete' : 'scenario.editor.guideReload'
        )}
        message={t(
          confirmation === 'delete'
            ? 'scenario.editor.guideDeleteMessage'
            : 'scenario.editor.guideReloadMessage'
        )}
        confirmText={t(
          confirmation === 'delete' ? 'common.actions.delete' : 'scenario.editor.guideReload'
        )}
        cancelText={t('common.actions.cancel')}
        onCancel={() => setConfirmation(null)}
        onConfirm={confirm}
      />
    </div>
  );
}
