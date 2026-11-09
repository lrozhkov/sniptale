import { flushEditorDocumentForExit } from '../document/file-actions/checkpoint-exit';
import { openEditorImageFromFile } from '../document/file-actions';
import type { EditorDocumentOpenPort } from '../document/file-actions/ports';
import { beginEditorPageLocalDraft } from '../document/page-session';
import type { EditorSessionAutosaveService } from '../document/session-autosave';
import type { EditorDocument } from '../../features/editor/document/types';

interface LocalImageDraftController extends EditorDocumentOpenPort {
  autosaveService: Pick<
    EditorSessionAutosaveService,
    | 'activate'
    | 'flushAutosave'
    | 'prepareCheckpointExit'
    | 'saveNow'
    | 'beginHydration'
    | 'persistSnapshot'
  > | null;
  exportDocument(): EditorDocument;
  isDocumentReadyForExport(): boolean;
  renderForExport(
    options: { format: 'png'; quality: 1; signal?: AbortSignal },
    draftPolicy?: 'finalize' | 'committed'
  ): Promise<string> | string;
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
      if (controller.isDocumentReadyForExport()) {
        await flushEditorDocumentForExit(autosaveService, () => controller.exportDocument());
        if (controller.autosaveService !== autosaveService)
          throw new Error('Editor document changed during exit.');
      }
    },
    onOpened: async (saveInitial) => {
      const autosaveService = controller.autosaveService;
      if (!autosaveService) return;
      beginEditorPageLocalDraft({
        autosaveService,
        renderPresentation: (signal) =>
          controller.renderForExport(
            { format: 'png', quality: 1, ...(signal ? { signal } : {}) },
            'committed'
          ),
        sourceTitle: file.name,
      });
      const initialDocument = controller.exportDocument();
      await (saveInitial ?? autosaveService.saveNow)(() => initialDocument);
    },
  });
}
