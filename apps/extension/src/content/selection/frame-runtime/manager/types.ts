import type { createUpdateGlobalStepBadgeSettings } from './step-badge/update';
import type { createReorderStepBadge } from './step-badge/reorder';
export type {
  FrameManagerRefs,
  FrameMutations,
  FrameSetter,
  FrameStateSetter,
  RecalculateStepBadges,
  RecalculateStepBadgesRef,
  UpdateFrameStepBadge,
  WithHistoryCommit,
} from '../contracts';

export type UpdateGlobalStepBadgeSettings = ReturnType<typeof createUpdateGlobalStepBadgeSettings>;
export type ReorderStepBadge = ReturnType<typeof createReorderStepBadge>;
