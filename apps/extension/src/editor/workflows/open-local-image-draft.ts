import { openEditorImageFromFile } from '../document/file-actions';
import type { EditorDocumentOpenPort } from '../document/file-actions/ports';
import { beginEditorPageLocalDraft } from '../document/page-session';
import type { EditorSessionAutosaveService } from '../document/session-autosave';
import type { EditorDocument } from '../../features/editor/document/types';

interface LocalImageDraftController extends EditorDocumentOpenPort {
  autosaveService: Pick<EditorSessionAutosaveService, 'activate' | 'flushAutosave'> | null;
  exportDocument(): EditorDocument;
  renderForExport(options: { format: 'png'; quality: 1 }): Promise<string> | string;
}

/** Opens a local image as a new durable standalone draft with its own page URL. */
export function openLocalImageAsEditorDraft(
  controller: LocalImageDraftController,
  file: File | undefined,
  setImageData: (imageData: string | null) => void
): Promise<void> {
  if (!file) {
    return openEditorImageFromFile(controller, file, setImageData);
  }
  return openEditorImageFromFile(controller, file, setImageData, {
    beforeOpen: async () => {
      const autosaveService = controller.autosaveService;
      if (!autosaveService) {
        throw new Error('Image autosave is unavailable.');
      }
      await autosaveService.flushAutosave(() => controller.exportDocument());
    },
    onOpened: () => {
      const autosaveService = controller.autosaveService;
      if (!autosaveService) return;
      beginEditorPageLocalDraft({
        autosaveService,
        renderPresentation: () => controller.renderForExport({ format: 'png', quality: 1 }),
        sourceTitle: file.name,
      });
    },
  });
}
