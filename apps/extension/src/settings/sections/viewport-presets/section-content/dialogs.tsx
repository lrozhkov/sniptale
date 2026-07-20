import { ViewportPresetEditor } from '../editor';
import type { ViewportPreset } from '../../../../contracts/settings';
import { ViewportConfirmDialog } from './viewport-confirm-dialog';

export function PresetsDialogs(props: {
  closeViewportDeleteDialog: () => void;
  closeViewportEditor: () => void;
  confirmDeleteViewport: () => Promise<void>;
  deleteMessage: string;
  editingViewport?: ViewportPreset;
  handleSaveViewportPreset: (label: string, width: number, height: number) => Promise<void>;
  isLoading: boolean;
  isViewportEditorOpen: boolean;
  viewportConfirmOpen: boolean;
}) {
  return (
    <>
      <ViewportPresetEditor
        isOpen={props.isViewportEditorOpen}
        onClose={props.closeViewportEditor}
        onSave={props.handleSaveViewportPreset}
        isLoading={props.isLoading}
        {...(props.editingViewport === undefined ? {} : { preset: props.editingViewport })}
      />

      <ViewportConfirmDialog
        viewportConfirmOpen={props.viewportConfirmOpen}
        deleteMessage={props.deleteMessage}
        confirmDeleteViewport={props.confirmDeleteViewport}
        closeViewportDeleteDialog={props.closeViewportDeleteDialog}
        isLoading={props.isLoading}
      />
    </>
  );
}
