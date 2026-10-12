import type {
  QuickEditAdvancedContent,
  QuickEditAdvancedState,
} from '../../features/video/review/advanced/types';
import type { ReviewTextTypingTarget } from '../../features/video/review/text-types';
import type { ReviewAnnotation, ReviewOperation } from '../../features/video/review/types';
import type { replayReviewHistory } from '../../features/video/review/document';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type { VideoWorkspaceTypingChange } from '../../composition/persistence/review-workspaces/typing';
import type * as persistence from '../../composition/persistence/review-workspaces/store';
import type {
  ReviewSpeechPublicationChange,
  ReviewSpeechPublicationReceipt,
} from './speech-publication-state';

export type AutosaveKey = 'advanced' | 'content' | 'draft';

export type AutosaveCapture = {
  change:
    | { kind: 'advanced'; advanced: QuickEditAdvancedState }
    | {
        kind: 'content';
        content: QuickEditAdvancedContent;
        typing?: {
          actionId: string;
          target: ReviewTextTypingTarget;
          writeId: string;
          continuation: boolean;
        };
      }
    | { kind: 'draft'; annotation: ReviewAnnotation | null; before: ReviewAnnotation | null };
  acknowledge(): void;
  fail(error: unknown): void;
};

export type Failure = 'conflict' | 'changed-source' | 'missing-media' | 'invalid' | 'storage';

export type ReviewSessionPersistence = Pick<
  typeof persistence,
  | 'saveVideoWorkspaceSnapshot'
  | 'commitVideoWorkspace'
  | 'moveVideoWorkspaceHistory'
  | 'readVideoWorkspace'
  | 'saveVideoWorkspaceAdvanced'
  | 'saveVideoWorkspaceDraft'
> &
  Partial<
    Pick<typeof persistence, 'saveVideoWorkspaceTyping' | 'commitVideoWorkspaceWithProjection'>
  >;

export type ReviewCommittedMutation =
  | VideoWorkspaceSnapshot
  | Awaited<ReturnType<typeof persistence.commitVideoWorkspaceWithProjection>>;

export type ReviewSessionState = {
  snapshot: VideoWorkspaceSnapshot;
  document: ReturnType<typeof replayReviewHistory>;
  autosaveEnabled: boolean;
  dirty: boolean;
  pending: number;
  error: Failure | null;
};

export type ReviewSpeechReceiptState = {
  intent?: string;
  changes?: readonly ReviewSpeechPublicationChange[];
  operation?: Extract<ReviewOperation, { target: 'advancedContent' }>;
  baseRevision?: number;
};

export type ReviewFailedTranscript =
  | { key: string; receipt: ReviewSpeechPublicationReceipt }
  | undefined;

export type ReviewDurableAttempt =
  | { id: string; baseRevision: number; confirmedAbsentRevision?: number }
  | undefined;

export type ReviewTypingAttempt = {
  change: VideoWorkspaceTypingChange;
  baseRevision: number;
  attempted: boolean;
};
