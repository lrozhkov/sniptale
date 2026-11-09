import { flushEditorDocumentForExit } from '../document/file-actions/checkpoint-exit';
import { clearEditorPageSession } from '../document/page-session';
import type { EditorSessionAutosaveService } from '../document/session-autosave';
import type { EditorDocument } from '../../features/editor/document/types';

interface ClosePageDocumentController {
  autosaveService: Pick<
    EditorSessionAutosaveService,
    'discardDraft' | 'flushAutosave' | 'prepareCheckpointExit'
  > | null;
  closeDocument(): void;
  exportDocument(): EditorDocument;
}

/** Detaches persistence, clears page restore identity, and closes the active document. */
export async function closeEditorPageDocument(args: {
  controller: ClosePageDocumentController;
  closeSavePicker: () => void;
}): Promise<void> {
  args.closeSavePicker();
  const autosave = args.controller.autosaveService;
  if (autosave) await flushEditorDocumentForExit(autosave, () => args.controller.exportDocument());
  if (args.controller.autosaveService !== autosave)
    throw new Error('Editor document changed during exit.');
  try {
    await autosave?.discardDraft();
  } finally {
    clearEditorPageSession();
    args.controller.closeDocument();
  }
}
