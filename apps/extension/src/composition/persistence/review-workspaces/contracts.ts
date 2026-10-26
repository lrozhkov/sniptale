import type {
  ReviewAnnotation,
  ReviewOperation,
  ReviewSource,
  ReviewDocument,
} from '../../../features/video/review/types';
import type { QuickEditAdvancedState } from '../../../features/video/review/advanced/types';
import type { LibraryLifecycle } from '../library-lifecycle/contracts';
import type { ReviewTextTypingTarget } from '../../../features/video/review/text-types';

/** One bounded active field group; writeId acknowledges only its latest immutable capture. */
export interface VideoWorkspaceTyping {
  actionId: string;
  target: ReviewTextTypingTarget;
  operationId: string | null;
  writeId: string;
}

/** Project metadata stays outside content Undo/Redo history. */
export interface VideoWorkspaceProject {
  name: string;
  lifecycle: LibraryLifecycle & { storageClass: 'library'; savedAt: number };
}

/** Durable review history for one library media identity; the document is derived by replay. */
export interface VideoWorkspace {
  aggregateId: string;
  /** Archived projects retain their source independently of their workspace identity. */
  sourceMediaId?: string;
  formatVersion: 1 | 2 | 3 | 4;
  /** Formats 3 and 4 require permanent project metadata. Formats 1 and 2 are legacy. */
  project?: VideoWorkspaceProject;
  /** Formats 2 and 4 retain the complete document immediately before the first remaining operation. */
  baseline?: ReviewDocument;
  typing?: VideoWorkspaceTyping;
  source: ReviewSource;
  sourceAssetId: string;
  /** Immutable visual sources; history contains only snapshot identities and authored instances. */
  effectSnapshots?: import('../../../features/video/review/annotation-effects/types').ReviewAnnotationEffectSnapshot[];
  revision: number;
  history: ReviewOperation[];
  cursor: number;
  advanced: QuickEditAdvancedState;
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
