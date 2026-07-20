import { translate } from '../../../../../platform/i18n';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import type { useTemplateListState } from '../state';
import type { TemplateListProps } from '../types';

export function TemplateDeleteDialog({
  isLoading,
  onDeleteTemplate,
  state,
}: {
  isLoading: boolean;
  onDeleteTemplate: TemplateListProps['onDeleteTemplate'];
  state: ReturnType<typeof useTemplateListState>;
}) {
  const deleteMessage =
    `${translate('aiModal.deleteTemplateMessagePrefix')}` +
    `${state.confirmState.template?.name ?? ''}` +
    translate('aiModal.deleteTemplateMessageSuffix');

  return (
    <ProductConfirmDialog
      isOpen={state.confirmState.isOpen}
      title={
        state.confirmState.template?.isDefault
          ? translate('aiModal.deleteDefaultTemplateTitle')
          : translate('aiModal.deleteTemplateTitle')
      }
      message={deleteMessage}
      confirmText={translate('common.actions.delete')}
      cancelText={translate('common.actions.cancel')}
      onConfirm={() => state.confirmDelete(onDeleteTemplate)}
      onCancel={state.cancelDelete}
      isLoading={isLoading}
      backdropClassName="!z-[2147483648]"
    />
  );
}
