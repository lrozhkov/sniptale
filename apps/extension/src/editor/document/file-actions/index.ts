import { createOutputFilename } from '../../../workflows/file-naming/index';
import { waitForEditorDocumentCanvas } from './canvas-ready';
import { readFileAsDataUrl, readFileAsText } from './file-reader';
import { assertEditorSessionFileCanBeRead, parseImportedEditorDocument } from './import-session';
import { logEditorDocumentOpenTrace } from './open-trace';
import {
  beginEditorDocumentOpenOperation,
  isCurrentEditorDocumentOpenOperation,
} from './operation';
import type {
  EditorDocumentExportPort,
  EditorDocumentInsertImagePort,
  EditorDocumentOpenPort,
} from './ports';
import { assertEditorRasterImageFileCanBeRead } from './raster-intake';
import type { EditorSessionAutosaveService } from '../session-autosave';
export {
  EditorStoragePromptError,
  isEditorStoragePromptError,
  loadEditorSaveOptions,
  saveEditorRenderedImage,
  applyEditorRenderedImageToScenario,
  type EditorSaveOptions,
  type SaveEditorRenderedImageOptions,
} from './save';

type ExportEditorSessionController = EditorDocumentExportPort;

export async function openEditorImageFromFile(
  controller: EditorDocumentOpenPort,
  file: File | undefined,
  setImageData: (imageData: string | null) => void,
  lifecycle: {
    beforeOpen?: () => Promise<void> | void;
    onOpened?: (saveInitial?: EditorSessionAutosaveService['saveNow']) => Promise<void> | void;
  } = {}
): Promise<void> {
  if (!file) {
    return;
  }

  logEditorDocumentOpenTrace('file:selected', {
    name: file.name,
    size: file.size,
    type: file.type,
  });
  assertEditorRasterImageFileCanBeRead(file);
  const openToken = beginEditorDocumentOpenOperation(controller);
  const dataUrl = await readFileAsDataUrl(file);
  if (!isCurrentEditorDocumentOpenOperation(openToken)) {
    return;
  }
  logEditorDocumentOpenTrace('file:read', {
    dataUrlLength: dataUrl.length,
    name: file.name,
  });
  await waitForEditorDocumentCanvas(controller);
  if (!isCurrentEditorDocumentOpenOperation(openToken)) {
    return;
  }
  logEditorDocumentOpenTrace('canvas:ready', {
    canvasReady: Boolean(controller.canvas),
  });
  await lifecycle.beforeOpen?.();
  if (!lifecycle.beforeOpen && controller.autosaveService) {
    if (!controller.exportDocument) throw new Error('Editor document export is unavailable.');
    await controller.autosaveService.flushAutosave(controller.exportDocument.bind(controller));
  }
  if (!isCurrentEditorDocumentOpenOperation(openToken)) {
    return;
  }
  const hydration = controller.autosaveService?.beginHydration(() =>
    isCurrentEditorDocumentOpenOperation(openToken)
  );
  try {
    await controller.openImage(dataUrl, file.name);
    if (!isCurrentEditorDocumentOpenOperation(openToken)) {
      return;
    }
    logEditorDocumentOpenTrace('controller:opened', {
      canvasReady: Boolean(controller.canvas),
      name: file.name,
    });
    await lifecycle.onOpened?.(hydration?.saveNow);
    if (!isCurrentEditorDocumentOpenOperation(openToken)) {
      return;
    }
    setImageData(dataUrl);
    hydration?.finish(true);
    if (!lifecycle.onOpened && controller.autosaveService) {
      if (!controller.exportDocument) throw new Error('Editor document export is unavailable.');
      await controller.autosaveService.persistSnapshot(controller.exportDocument.bind(controller));
    }
  } catch (error) {
    hydration?.finish(false);
    throw error;
  }
}

export async function insertEditorImageFromFile(
  controller: EditorDocumentInsertImagePort,
  file: File | undefined
): Promise<void> {
  if (!file) {
    return;
  }

  assertEditorRasterImageFileCanBeRead(file);
  const dataUrl = await readFileAsDataUrl(file);
  await controller.insertImage(dataUrl, file.name);
}

export async function importEditorSessionFromFile(
  controller: EditorDocumentOpenPort,
  file: File | undefined,
  setImageData: (imageData: string | null) => void
): Promise<void> {
  if (!file) {
    return;
  }

  logEditorDocumentOpenTrace('session:selected', {
    name: file.name,
    size: file.size,
  });
  assertEditorSessionFileCanBeRead(file);
  const openToken = beginEditorDocumentOpenOperation(controller);
  const text = await readFileAsText(file);
  if (!isCurrentEditorDocumentOpenOperation(openToken)) {
    return;
  }
  const document = parseImportedEditorDocument(text);
  await waitForEditorDocumentCanvas(controller);
  if (!isCurrentEditorDocumentOpenOperation(openToken)) {
    return;
  }
  const autosaveService = controller.autosaveService;
  if (autosaveService) {
    if (!controller.exportDocument) throw new Error('Editor document export is unavailable.');
    const getDocument = controller.exportDocument.bind(controller);
    await autosaveService.flushAutosave(getDocument);
    if (!isCurrentEditorDocumentOpenOperation(openToken)) return;
  }
  await loadEditorSessionDocument(controller, document, openToken, setImageData);
}

async function loadEditorSessionDocument(
  controller: EditorDocumentOpenPort,
  document: ReturnType<typeof parseImportedEditorDocument>,
  openToken: ReturnType<typeof beginEditorDocumentOpenOperation>,
  setImageData: (imageData: string | null) => void
) {
  const autosaveService = controller.autosaveService;
  const hydration = autosaveService?.beginHydration(() =>
    isCurrentEditorDocumentOpenOperation(openToken)
  );
  try {
    await controller.loadDocument(document);
    if (!isCurrentEditorDocumentOpenOperation(openToken)) {
      return;
    }
    logEditorDocumentOpenTrace('session:loaded', {
      canvasReady: Boolean(controller.canvas),
      canvasWidth: document.canvasWidth,
      canvasHeight: document.canvasHeight,
    });
    setImageData(document.sourceImageData);
    hydration?.finish(true);
    if (autosaveService && controller.exportDocument)
      await autosaveService.persistSnapshot(controller.exportDocument.bind(controller));
  } catch (error) {
    hydration?.finish(false);
    throw error;
  }
}

export async function exportEditorSession(
  controller: ExportEditorSessionController
): Promise<void> {
  const sessionDocument = controller.exportDocument();
  const filename = await createOutputFilename({
    category: 'resources',
    type: 'editor-session',
    extension: 'json',
  });
  const blob = new Blob([JSON.stringify(sessionDocument, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
