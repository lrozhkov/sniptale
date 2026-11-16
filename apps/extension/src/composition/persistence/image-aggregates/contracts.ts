import type { EditorDocument } from '../../../features/editor/document/types';
import type { AssetRef } from '../assets/contracts';
import type { ImageContentState } from '../media-library/contracts';
import type { SyncCheckpointReceipt } from '../sync-capture/contracts';
import type { EditorImageHistoryCheckpoint } from '../../../features/editor-history/image-checkpoint';

export interface CommitImageWorkspaceInput {
  aggregateId: string;
  captureTime?: number;
  document: EditorDocument;
  /** Undefined preserves retained history; null explicitly clears it. */
  history?: EditorImageHistoryCheckpoint | null;
  reusableHistoryAssetsByValue?: ReadonlyMap<string, AssetRef>;
  expectedRevision: number;
  /** Native lifetime observed before asynchronous capture; legacy absence is null. */
  expectedGeneration?: string | null;
  imageContentState?: ImageContentState;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  sourceFavicon?: string | null;
  sourceGuard?: {
    aggregateId: string;
    presentationRevision: number;
    workspaceRevision: number;
    sourceGeneration?: string | null;
  };
  requireMissingRoot?: boolean;
  /** Editing an observed Library root must not recreate it after permanent deletion. */
  requireExistingRoot?: boolean;
  reusableAssetsByRuntimeUrl?: ReadonlyMap<string, AssetRef>;
  reusableAssetsByVectorDefinitionId?: ReadonlyMap<string, AssetRef>;
}

export interface ImageWorkspacePublicationResult {
  readonly sourceGeneration?: string;
  readonly checkpointReceipt?: SyncCheckpointReceipt;
  revision: number;
  updatedAt: number;
}

export interface CommitImageWorkspaceResult extends ImageWorkspacePublicationResult {
  documentAssetsByRuntimeUrl: ReadonlyMap<string, AssetRef>;
  documentAssetsByVectorDefinitionId: ReadonlyMap<string, AssetRef>;
  historyAssetsByValue?: ReadonlyMap<string, AssetRef>;
}

export interface ImageAggregateCopyResult extends CommitImageWorkspaceResult {
  aggregateId: string;
}

export interface CommitImagePresentationInput {
  aggregateId: string;
  expectedWorkspaceRevision: number;
  expectedGeneration?: string | null;
  previewBlob: Blob;
  thumbnailBlob: Blob;
}

export interface SaveImageAggregateCopyFromDocumentInput {
  document: EditorDocument;
  history?: EditorImageHistoryCheckpoint;
  imageContentState?: ImageContentState;
  previewBlob: Blob;
  sourceFavicon?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  targetAggregateId: string;
  thumbnailBlob: Blob;
  sourceGuard?: CommitImageWorkspaceInput['sourceGuard'];
}
