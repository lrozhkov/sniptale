import type { EditorDocument } from '../../../features/editor/document/types';
import type { AssetRef } from '../assets/contracts';
import type { ImageContentState } from '../media-library/contracts';
import type { SyncCheckpointReceipt } from '../sync-capture/contracts';

export interface CommitImageWorkspaceInput {
  aggregateId: string;
  captureTime?: number;
  document: EditorDocument;
  expectedRevision: number;
  imageContentState?: ImageContentState;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  sourceFavicon?: string | null;
  sourceGuard?: {
    aggregateId: string;
    presentationRevision: number;
    workspaceRevision: number;
  };
  requireMissingRoot?: boolean;
  /** Editing an observed Library root must not recreate it after permanent deletion. */
  requireExistingRoot?: boolean;
  reusableAssetsByRuntimeUrl?: ReadonlyMap<string, AssetRef>;
  reusableAssetsByVectorDefinitionId?: ReadonlyMap<string, AssetRef>;
}

export interface ImageWorkspacePublicationResult {
  readonly checkpointReceipt?: SyncCheckpointReceipt;
  revision: number;
  updatedAt: number;
}

export interface CommitImageWorkspaceResult extends ImageWorkspacePublicationResult {
  documentAssetsByRuntimeUrl: ReadonlyMap<string, AssetRef>;
  documentAssetsByVectorDefinitionId: ReadonlyMap<string, AssetRef>;
}

export interface CommitImagePresentationInput {
  aggregateId: string;
  expectedWorkspaceRevision: number;
  previewBlob: Blob;
  thumbnailBlob: Blob;
}

export interface SaveImageAggregateCopyFromDocumentInput {
  document: EditorDocument;
  imageContentState?: ImageContentState;
  previewBlob: Blob;
  sourceFavicon?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  targetAggregateId: string;
  thumbnailBlob: Blob;
  sourceGuard?: CommitImageWorkspaceInput['sourceGuard'];
}
