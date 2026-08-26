import { openGalleryPage } from '../../../platform/navigation/extension-pages';
import { translate } from '../../../platform/i18n';
import { isEditorStoragePromptError } from '../../document/file-actions';
import type { EditorInspectorConfirmDialogState } from '../content/types';

function buildOpenLibraryDialog(message: string): EditorInspectorConfirmDialogState {
  return {
    title: translate('gallery.app.openLibrary'),
    message,
    confirmText: translate('gallery.app.openLibrary'),
    cancelText: translate('common.actions.cancel'),
  };
}

export async function maybeHandleEditorSaveFailure(args: {
  confirmOpenLibrary: (dialog: EditorInspectorConfirmDialogState) => Promise<boolean>;
  error: unknown;
  openLibrary?: () => Promise<void>;
}): Promise<boolean> {
  if (!isEditorStoragePromptError(args.error)) {
    return false;
  }

  const shouldOpenLibrary = await args.confirmOpenLibrary(
    buildOpenLibraryDialog(args.error.message)
  );
  if (shouldOpenLibrary) {
    await (args.openLibrary?.() ?? openGalleryPage());
  }

  return true;
}
