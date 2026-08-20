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

export interface AssetOperationCompensation {
  assetId: string;
  journalId: string;
  nextMediaId: string;
  nextOwnerId: string;
  nextProjectExportId?: string;
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
