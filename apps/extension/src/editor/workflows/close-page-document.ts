import { clearEditorPageSession } from '../document/page-session';
import type { EditorSessionAutosaveService } from '../document/session-autosave';
import type { EditorDocument } from '../../features/editor/document/types';

interface ClosePageDocumentController {
  autosaveService: Pick<EditorSessionAutosaveService, 'discardDraft' | 'flushAutosave'> | null;
  closeDocument(): void;
  exportDocument(): EditorDocument;
}

/** Detaches persistence, clears page restore identity, and closes the active document. */
export async function closeEditorPageDocument(args: {
  controller: ClosePageDocumentController;
  closeSavePicker: () => void;
}): Promise<void> {
  args.closeSavePicker();
  await args.controller.autosaveService?.flushAutosave(() => args.controller.exportDocument());
  try {
    await args.controller.autosaveService?.discardDraft();
  } finally {
    clearEditorPageSession();
    args.controller.closeDocument();
  }
}
