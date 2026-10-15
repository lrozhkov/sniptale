import type { EditorDocument } from '../../../features/editor/document/types';
import type { EditorRenderToDataUrlOptions } from '../model/render-options';
import type { EditorSessionAutosaveService } from '../session-autosave';

export interface CanvasReadyPort {
  canvas: unknown | null;
}

export interface EditorDocumentOpenPort extends CanvasReadyPort {
  autosaveService?: Pick<
    EditorSessionAutosaveService,
    'beginHydration' | 'flushAutosave' | 'persistSnapshot'
  > | null;
  exportDocument?(): EditorDocument;
  loadDocument(document: EditorDocument): Promise<void>;
  openImage(dataUrl: string, name?: string | null): Promise<void>;
}

export interface EditorDocumentInsertImagePort {
  insertImage(dataUrl: string, name?: string | null): Promise<void>;
}

export interface EditorDocumentExportPort {
  exportDocument(): EditorDocument;
}

export interface EditorRenderedImagePort extends EditorDocumentExportPort {
  renderToDataUrl(options: EditorRenderToDataUrlOptions): string;
  renderForExport?(options: EditorRenderToDataUrlOptions): Promise<string>;
}
