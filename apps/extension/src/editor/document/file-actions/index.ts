import { SESSION_EXPORT_FILENAME } from '@sniptale/ui/branding';
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
export {
  EditorStoragePromptError,
  isEditorStoragePromptError,
  loadEditorSaveOptions,
  saveEditorRenderedImage,
  type EditorSaveOptions,
  type SaveEditorRenderedImageOptions,
} from './save';

type ExportEditorSessionController = EditorDocumentExportPort;

export async function openEditorImageFromFile(
  controller: EditorDocumentOpenPort,
  file: File | undefined,
  setImageData: (imageData: string | null) => void
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
  await controller.openImage(dataUrl, file.name);
  if (!isCurrentEditorDocumentOpenOperation(openToken)) {
    return;
  }
  logEditorDocumentOpenTrace('controller:opened', {
    canvasReady: Boolean(controller.canvas),
    name: file.name,
  });
  setImageData(dataUrl);
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
}

export function exportEditorSession(controller: ExportEditorSessionController): void {
  const sessionDocument = controller.exportDocument();
  const blob = new Blob([JSON.stringify(sessionDocument, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = SESSION_EXPORT_FILENAME;
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
