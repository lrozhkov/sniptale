// policyStateIds: [] - staging byte budgets and storage contracts own bounded media resources, not caller authority.
export const RECORDING_STAGING_PENDING_BYTES_LIMIT = 64 * 1024 * 1024;

export interface RecordingStagingArtifactInput {
  artifactId: string;
  filename: string;
  mimeType: string;
}

export interface FinalizedRecordingStagingArtifact {
  artifactId: string;
  file: File;
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
  abort(): Promise<void>;
  delete(): Promise<void>;
  getPendingBytes(): number;
  openArtifact(input: RecordingStagingArtifactInput): Promise<RecordingStagingArtifactWriter>;
}

export interface RecordingStagingStorageArtifact {
  abort(): Promise<void>;
  append(chunk: Blob): Promise<void>;
  close(): Promise<void>;
  getFile(): Promise<File>;
  remove(): Promise<void>;
}

export interface RecordingStagingStorageSession {
  createArtifact(): Promise<RecordingStagingStorageArtifact>;
  remove(): Promise<void>;
}

export interface RecordingStagingStorageAdapter {
  countSessions(): Promise<number>;
  createSession(): Promise<RecordingStagingStorageSession>;
  removeAllSessions(): Promise<number>;
}
