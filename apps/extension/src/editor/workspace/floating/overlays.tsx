import { EditorFloatingConfirmDialog } from './confirm-dialog';
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
