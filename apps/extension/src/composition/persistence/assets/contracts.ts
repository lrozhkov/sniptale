export interface AssetRef {
  assetId: string;
  createdAt: number;
  location: { kind: 'opfs'; objectKey: string };
  mimeType: string;
  sha256: string | null;
  size: number;
}

export interface AssetOwner {
  assetId: string;
  ownerKind: string;
  ownerId: string;
  role: string;
}

export type AssetOperationStatus = 'aborted' | 'committed' | 'pending';
export type ArchiveRestoreStrategy = 'replace' | 'skip' | 'duplicate';

export interface AssetOperationCompensation {
  assetId: string;
  journalId: string;
  nextMediaId: string;
  nextOwnerId: string;
  nextProjectAssetId?: string;
  nextProjectExportId?: string;
  nextWebSnapshotId?: string;
  ownerKind?: string;
  ownerRole?: string;
  previousRecords: Record<string, unknown>;
}

export interface AssetOperation {
  operationId: string;
  kind: 'backup-restore';
  status: AssetOperationStatus;
  createdAt: number;
  updatedAt: number;
  compensations: AssetOperationCompensation[];
  obsoleteAssetIds: string[];
}

export interface PhysicalDeleteAssetOperation {
  operationId: string;
  kind: 'physical-delete';
  status: 'pending';
  createdAt: number;
  updatedAt: number;
  assetIds: string[];
}

export interface ArchiveRestoreSession {
  operationId: string;
  kind: 'archive-restore-session';
  status: 'pending' | 'completed' | 'aborted';
  createdAt: number;
  updatedAt: number;
  archiveFingerprint: string;
  strategy: ArchiveRestoreStrategy;
  committedRoots: string[];
  /** Durable portable-root to local-root identity mapping for cross-root references. */
  rootIdMap: Record<string, string>;
  /** Roots whose portable identity collided with an existing local graph. */
  conflictedRoots: string[];
  skippedRoots: string[];
  currentRoot: string | null;
}

export interface PreparedAssetObject {
  ref: AssetRef;
}

export interface AssetObjectWriter {
  readonly assetId: string;
  abort(): Promise<void>;
  append(chunk: Blob): Promise<void>;
  finalize(): Promise<PreparedAssetObject>;
}

export interface AssetReadyJournal<TPayload = unknown> {
  assetRefs: AssetRef[];
  createdAt: number;
  domain: string;
  journalId: string;
  operationId?: string;
  payload: TPayload;
}

export interface AssetPublicationAdapter {
  domain: string;
  publish(journal: AssetReadyJournal): Promise<void>;
}
