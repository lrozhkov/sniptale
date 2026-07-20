import type { EditorDocument } from '../../../../features/editor/document/types';
import type { ApplyDocumentOptions, OpenImageOptions } from '../../core/types';
import type {
  EditorRenderedImageOptions,
  EditorRenderToDataUrlOptions,
} from '../../../document/model/render-options';

export interface EditorControllerInstanceDocumentActions {
  applyDocument(document: EditorDocument, options: ApplyDocumentOptions): Promise<void>;
  openImage(dataUrl: string, sourceName?: string | null, options?: OpenImageOptions): Promise<void>;
  loadDocument(document: EditorDocument): Promise<void>;
  closeDocument(): void;
  exportDocument(): EditorDocument;
  renderToDataUrl(options: EditorRenderToDataUrlOptions): string;
  copyRenderedImage(options?: EditorRenderedImageOptions): Promise<void>;
  withHistoryMuted<T>(callback: () => T): T;
  commitHistory(): void;
  undo(): Promise<void>;
  redo(): Promise<void>;
  resetToOriginal(): Promise<void>;
}
