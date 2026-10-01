import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import type { EditorFloatingDocumentController } from './document-bar';

type ConfirmController = Pick<
  EditorFloatingDocumentController,
  'confirmDialog' | 'onConfirmDialogConfirm' | 'onConfirmDialogCancel'
>;

export function EditorFloatingConfirmDialog({
  documentController,
}: {
  documentController: ConfirmController;
}) {
  const confirmDialog = documentController.confirmDialog;
  if (!confirmDialog) return null;
  return (
    <ProductConfirmDialog
      title={confirmDialog.title}
      message={confirmDialog.message}
      confirmText={confirmDialog.confirmText}
      cancelText={confirmDialog.cancelText}
      onConfirm={documentController.onConfirmDialogConfirm}
      onCancel={documentController.onConfirmDialogCancel}
    />
  );
}
