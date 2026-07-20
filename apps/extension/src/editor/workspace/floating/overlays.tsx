import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { EditorInspectorSidebarHiddenInputs } from '../../inspector/sidebar/hidden-inputs';
import type { EditorFloatingDocumentController } from './document-bar';

export type EditorFloatingWorkspaceOverlaysController = Pick<
  EditorFloatingDocumentController,
  | 'backgroundImageInputRef'
  | 'confirmDialog'
  | 'handleBackgroundImageUpload'
  | 'importSessionInputRef'
  | 'onConfirmDialogCancel'
  | 'onConfirmDialogConfirm'
  | 'openImageInputRef'
  | 'setImageData'
>;

function EditorFloatingConfirmDialog({
  documentController,
}: {
  documentController: EditorFloatingWorkspaceOverlaysController;
}) {
  const confirmDialog = documentController.confirmDialog;

  if (!confirmDialog) {
    return null;
  }

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

export function EditorFloatingWorkspaceOverlays({
  documentController,
}: {
  documentController: EditorFloatingWorkspaceOverlaysController;
}) {
  return (
    <>
      <EditorInspectorSidebarHiddenInputs
        openImageInputRef={documentController.openImageInputRef}
        importSessionInputRef={documentController.importSessionInputRef}
        backgroundImageInputRef={documentController.backgroundImageInputRef}
        setImageData={documentController.setImageData}
        handleBackgroundImageUpload={documentController.handleBackgroundImageUpload}
      />
      <EditorFloatingConfirmDialog documentController={documentController} />
    </>
  );
}
