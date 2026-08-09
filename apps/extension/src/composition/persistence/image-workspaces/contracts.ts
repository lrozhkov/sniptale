import type { EditorDocument } from '../../../features/editor/document/types';

/** Authoritative editable document for an image aggregate. */
export interface ImageWorkspaceEntry {
  aggregateId: string;
  createdAt: number;
  document: EditorDocument;
  revision: number;
  sourceTitle: string | null;
  sourceUrl: string | null;
  updatedAt: number;
}
