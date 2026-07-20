import type { EditorDocument } from '../../../features/editor/document/types';

export interface EditorSessionEntry {
  sessionId: string;
  document: EditorDocument;
  assetId: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  createdAt: number;
  updatedAt: number;
  dirty: boolean;
}
