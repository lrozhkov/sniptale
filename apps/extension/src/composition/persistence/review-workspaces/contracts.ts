import type {
  ReviewAnnotation,
  ReviewOperation,
  ReviewSource,
} from '../../../features/video/review/types';

/** Durable review history for one library media identity; the document is derived by replay. */
export interface VideoWorkspace {
  aggregateId: string;
  formatVersion: 1;
  source: ReviewSource;
  sourceAssetId: string;
  revision: number;
  history: ReviewOperation[];
  cursor: number;
  createdAt: number;
  updatedAt: number;
}

/** Recovery text is separate from history, including the value the user started editing. */
export interface VideoWorkspaceDraft {
  aggregateId: string;
  revision: number;
  annotation: ReviewAnnotation;
  before: ReviewAnnotation | null;
  updatedAt: number;
}

export interface VideoWorkspaceSnapshot {
  workspace: VideoWorkspace;
  draft: VideoWorkspaceDraft | null;
}
