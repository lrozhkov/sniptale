import { Copy, MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { GUIDE_LIMITS, type GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { GuideActionMenu } from './action-menu';

export function GuideProjectActions({
  project,
  disabled,
  onDuplicate,
  onDelete,
  t,
}: {
  project: GuideProject;
  disabled: boolean;
  onDuplicate: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  t: Translate;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const copy = () => {
    const pattern = t('scenario.editor.guideCopyName');
    const available = GUIDE_LIMITS.maxLabelLength - pattern.replace('{name}', '').length;
    void onDuplicate(pattern.replace('{name}', project.name.slice(0, available)));
  };
  const confirm = async () => {
    await onDelete();
    setConfirmDelete(false);
  };
  return (
    <div role="group" aria-label={t('scenario.editor.projectLabel')}>
      <GuideActionMenu
        label={t('scenario.editor.projectLabel')}
        icon={<MoreHorizontal size={16} aria-hidden="true" />}
        items={[
          {
            label: t('scenario.editor.guideDuplicate'),
            disabled,
            icon: <Copy size={15} aria-hidden="true" />,
            onSelect: copy,
          },
          {
            label: t('scenario.editor.guideDelete'),
            disabled,
            icon: <Trash2 size={15} aria-hidden="true" />,
            danger: true,
            onSelect: () => setConfirmDelete(true),
          },
        ]}
      />
      <ProductConfirmDialog
        isOpen={confirmDelete}
        isLoading={disabled}
        title={t('scenario.editor.guideDelete')}
        message={t('scenario.editor.guideDeleteMessage')}
        confirmText={t('common.actions.delete')}
        cancelText={t('common.actions.cancel')}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={confirm}
      />
    </div>
  );
}
