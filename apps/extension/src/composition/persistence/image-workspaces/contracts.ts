import type { EditorDocument } from '../../../features/editor/document/types';
import type { PersistedEditorDocument } from '../document-assets/contracts';
import type { AssetRef } from '../assets/contracts';
import type { EditorImageHistoryCheckpoint } from '../../../features/editor-history/image-checkpoint';
import type { PersistedImageHistory } from './history-contracts';
import type { LibraryLifecycle } from '../library-lifecycle/contracts';

/** Authoritative editable document for an image aggregate. */
export interface ImageWorkspaceEntry {
  aggregateId: string;
  /** Original Library media for a project with an independent ID. */
  sourceMediaId?: string;
  lifecycle?: LibraryLifecycle;
  createdAt: number;
  document: EditorDocument;
  history?: EditorImageHistoryCheckpoint;
  historyAssetsByValue?: ReadonlyMap<string, AssetRef>;
  revision: number;
  sourceGeneration?: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  updatedAt: number;
  documentAssetsByVectorDefinitionId?: ReadonlyMap<string, AssetRef>;
  documentAssetsByRuntimeUrl?: ReadonlyMap<string, AssetRef>;
  releaseDocumentAssets?(): void;
}

export interface StoredImageWorkspaceEntry extends Omit<
  ImageWorkspaceEntry,
  'document' | 'history' | 'historyAssetsByValue' | 'sourceGeneration'
> {
  document: PersistedEditorDocument;
  history?: PersistedImageHistory;
  /** Exact native journal receipt; excluded from portable project content. */
  publicationId?: string;
}
