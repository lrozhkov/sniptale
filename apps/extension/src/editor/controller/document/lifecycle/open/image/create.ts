import type { EditorDocument } from '../../../../../../features/editor/document/types';
import { createBaseDocument } from '../../..';
import type { EditorOpenImageContext } from './context';
import { traceEditorImageDocumentCreated } from './trace/events';
import { traceEditorImageOpenStart } from './trace/start';

export async function createOpenedEditorDocument(options: {
  context: EditorOpenImageContext;
  dataUrl: string;
  sourceName: string | null;
}): Promise<EditorDocument> {
  traceEditorImageOpenStart(options);

  const document = await createBaseDocument(
    options.dataUrl,
    options.sourceName,
    options.context.frame,
    {
      ...options.context.browserFrame,
      faviconDataUrl: null,
      title: options.context.pageTitle,
      url: options.context.browserFrameUrl,
    }
  );

  traceEditorImageDocumentCreated(document);

  return document;
}
