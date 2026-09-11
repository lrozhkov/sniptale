import { Copy, FolderOpen, MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { GUIDE_LIMITS, type GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { GuideActionMenu } from './action-menu';
import type { useGuidePageState } from './runtime/use-state';

export function GuideProjectActions({
  project,
  disabled,
  status,
  onDuplicate,
  onDelete,
  onReload,
  t,
}: {
  project: GuideProject;
  disabled: boolean;
  status: ReturnType<typeof useGuidePageState>['status'];
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
      <GuideActionMenu
        label={t('scenario.editor.projectLabel')}
        icon={<MoreHorizontal size={16} aria-hidden="true" />}
        disabled={disabled}
        items={[
          {
            label: t('scenario.editor.guideDuplicate'),
            icon: <Copy size={15} aria-hidden="true" />,
            onSelect: copy,
          },
          ...(status === 'conflict' || status === 'failed'
            ? [
                {
                  label: t('scenario.editor.guideReload'),
                  icon: <FolderOpen size={15} aria-hidden="true" />,
                  onSelect: () => {
                    if (hasUnsavedChanges) setConfirmation('reload');
                    else void onReload();
                  },
                },
              ]
            : []),
          {
            label: t('scenario.editor.guideDelete'),
            icon: <Trash2 size={15} aria-hidden="true" />,
            danger: true,
            onSelect: () => setConfirmation('delete'),
          },
        ]}
      />
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
