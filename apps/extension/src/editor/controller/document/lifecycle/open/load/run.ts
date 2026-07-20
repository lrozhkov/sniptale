import { applyLoadedEditorDocument } from './apply';
import type { OpenLoadedEditorControllerDocumentOptions } from './options';
import { traceLoadedEditorDocumentStart } from './trace';

export async function openLoadedEditorControllerDocument(
  options: OpenLoadedEditorControllerDocumentOptions
): Promise<void> {
  traceLoadedEditorDocumentStart(options.document);
  await applyLoadedEditorDocument(options);
}
