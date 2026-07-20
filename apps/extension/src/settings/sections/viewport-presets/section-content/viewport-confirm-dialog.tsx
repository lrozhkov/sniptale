import { translate } from '../../../../platform/i18n';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';

export function ViewportConfirmDialog(props: {
  closeViewportDeleteDialog: () => void;
  confirmDeleteViewport: () => Promise<void>;
  deleteMessage: string;
  isLoading: boolean;
  viewportConfirmOpen: boolean;
}) {
  return (
    <ProductConfirmDialog
      isOpen={props.viewportConfirmOpen}
      title={translate('viewportPresets.section.deleteTitle')}
      message={props.deleteMessage}
      confirmText={translate('common.actions.delete')}
      cancelText={translate('common.actions.cancel')}
      onConfirm={props.confirmDeleteViewport}
      onCancel={props.closeViewportDeleteDialog}
      isLoading={props.isLoading}
      backdropClassName="!z-[2147483648]"
    />
  );
}
