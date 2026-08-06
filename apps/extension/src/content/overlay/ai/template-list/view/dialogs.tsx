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
  const template = state.confirmState.template;
  const systemAction = template?.enabled === false ? 'enable' : 'disable';
  const message = template?.isDefault
    ? translate(
        systemAction === 'enable'
          ? 'aiModal.enableSystemTemplateMessage'
          : 'aiModal.disableSystemTemplateMessage'
      ).replace('{name}', template.name)
    : `${translate('aiModal.deleteTemplateMessagePrefix')}${template?.name ?? ''}${translate(
        'aiModal.deleteTemplateMessageSuffix'
      )}`;

  return (
    <ProductConfirmDialog
      isOpen={state.confirmState.isOpen}
      title={
        template?.isDefault
          ? translate(
              systemAction === 'enable'
                ? 'aiModal.enableSystemTemplateTitle'
                : 'aiModal.disableSystemTemplateTitle'
            )
          : translate('aiModal.deleteTemplateTitle')
      }
      message={message}
      confirmText={
        template?.isDefault
          ? translate(
              systemAction === 'enable'
                ? 'aiModal.enableSystemTemplate'
                : 'aiModal.disableSystemTemplate'
            )
          : translate('common.actions.delete')
      }
      cancelText={translate('common.actions.cancel')}
      onConfirm={() => state.confirmDelete(onDeleteTemplate)}
      onCancel={state.cancelDelete}
      isLoading={isLoading}
      backdropClassName="!z-[2147483648]"
    />
  );
}
