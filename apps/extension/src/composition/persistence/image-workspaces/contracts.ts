import type { EditorDocument } from '../../../features/editor/document/types';
import type { PersistedEditorDocumentV3 } from '../document-assets';

/** Authoritative editable document for an image aggregate. */
export interface ImageWorkspaceEntry {
  aggregateId: string;
  createdAt: number;
  document: EditorDocument;
  revision: number;
  sourceTitle: string | null;
  sourceUrl: string | null;
  updatedAt: number;
  releaseDocumentAssets?(): void;
}

export interface StoredImageWorkspaceEntry extends Omit<ImageWorkspaceEntry, 'document'> {
  document: PersistedEditorDocumentV3;
}
