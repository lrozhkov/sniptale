import { openGalleryPage } from '../../../platform/navigation/extension-pages';
import { translate } from '../../../platform/i18n';
import { isEditorStoragePromptError } from '../../document/file-actions';
import type { EditorInspectorConfirmDialogState } from '../content/types';

function buildStorageManagerDialog(message: string): EditorInspectorConfirmDialogState {
  return {
    title: translate('gallery.app.openStorageManager'),
    message: `${message}\n\n${translate('gallery.app.openStorageManager')}?`,
    confirmText: translate('gallery.app.openStorageManager'),
    cancelText: translate('common.actions.cancel'),
  };
}

export async function maybeHandleEditorSaveFailure(args: {
  confirmOpenStorageManager: (dialog: EditorInspectorConfirmDialogState) => Promise<boolean>;
  error: unknown;
  openStorageManager?: () => Promise<void>;
}): Promise<boolean> {
  if (!isEditorStoragePromptError(args.error)) {
    return false;
  }

  const shouldOpenStorageManager = await args.confirmOpenStorageManager(
    buildStorageManagerDialog(args.error.message)
  );
  if (shouldOpenStorageManager) {
    await (args.openStorageManager?.() ?? openGalleryPage({ openStorageManager: true }));
  }

  return true;
}
