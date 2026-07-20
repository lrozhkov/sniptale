import type { EditorDocument } from '../../../../../features/editor/document/types';
import {
  createEditorDocumentCommandService,
  type EditorDocumentCommandController,
} from '../../../document-commands';
import type {
  EditorRenderedImageOptions,
  EditorRenderToDataUrlOptions,
} from '../../../../document/model/render-options';
import type { OpenImageOptions } from '../../../core/types';
import type { EditorControllerInstance } from '../../types';

const defaultDocumentCommands = createEditorDocumentCommandService();

function asDocumentCommandController(
  controller: EditorControllerInstance
): EditorDocumentCommandController {
  return controller;
}

export async function openImageForController(
  controller: EditorControllerInstance,
  dataUrl: string,
  sourceName: string | null = null,
  options: OpenImageOptions = {}
): Promise<void> {
  await defaultDocumentCommands.openImage(
    asDocumentCommandController(controller),
    dataUrl,
    sourceName,
    options
  );
}

export async function loadDocumentForController(
  controller: EditorControllerInstance,
  document: EditorDocument
): Promise<void> {
  await defaultDocumentCommands.loadDocument(asDocumentCommandController(controller), document);
}

export function closeDocumentForController(controller: EditorControllerInstance): void {
  defaultDocumentCommands.closeDocument(asDocumentCommandController(controller));
}

export function exportDocumentForController(controller: EditorControllerInstance): EditorDocument {
  return defaultDocumentCommands.exportDocument(asDocumentCommandController(controller));
}

export function renderToDataUrlForController(
  controller: EditorControllerInstance,
  options: EditorRenderToDataUrlOptions
): string {
  return defaultDocumentCommands.renderToDataUrl(asDocumentCommandController(controller), options);
}

export async function copyRenderedImageForController(
  controller: EditorControllerInstance,
  options?: EditorRenderedImageOptions
): Promise<void> {
  await defaultDocumentCommands.copyRenderedImage(asDocumentCommandController(controller), options);
}
