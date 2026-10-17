import type { RecordingRecoverySource } from '../recovery/publication';
// policyStateIds: [] - staging byte budgets and storage contracts own bounded media resources, not caller authority.
import type { PreparedAssetObject } from '../../assets';
export const RECORDING_STAGING_PENDING_BYTES_LIMIT = 64 * 1024 * 1024;

export interface RecordingStagingArtifactInput {
  artifactId: string;
  groupId?: string;
  role?: string;
  filename: string;
  mimeType: string;
}

export interface FinalizedRecordingStagingArtifact {
  recoverySource?: RecordingRecoverySource;
  artifactId: string;
  asset: PreparedAssetObject;
  filename: string;
  mimeType: string;
  size: number;
}

export interface RecordingStagingArtifactWriter {
  abort(): Promise<void>;
  append(chunk: Blob): Promise<void>;
  finalize(): Promise<FinalizedRecordingStagingArtifact>;
}

export interface RecordingStagingCoordinator {
  discard?(): Promise<void>;
  abort(): Promise<void>;
  delete(): Promise<void>;
  getPendingBytes(): number;
  openArtifact(input: RecordingStagingArtifactInput): Promise<RecordingStagingArtifactWriter>;
}
