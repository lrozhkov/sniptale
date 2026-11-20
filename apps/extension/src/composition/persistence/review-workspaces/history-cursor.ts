import type { VideoWorkspace } from './contracts';
import type { ReviewHistoryMove } from '../../../features/video/review/types';
import { withoutVideoWorkspaceTyping } from './typing';

/** Resolve an explicit step against the current retained history after queued work settles. */
export function resolveReviewWorkspaceHistoryCursor(
  workspace: Pick<VideoWorkspace, 'cursor' | 'history'>,
  move: ReviewHistoryMove
): number {
  if (move === 'start') return 0;
  if (move === 'undo') return workspace.cursor - 1;
  if (move === 'redo') return workspace.cursor + 1;
  const index = workspace.history.findIndex((entry) => entry.id === move.entryId);
  return index < 0 ? workspace.cursor : index + 1;
}

/** Content history preserves independent lane membership and lock preferences. */
export function moveReviewWorkspaceCursor(
  workspace: VideoWorkspace,
  requested: number
): VideoWorkspace {
  const cursor = Math.max(0, Math.min(workspace.history.length, requested));
  return {
    ...withoutVideoWorkspaceTyping(workspace),
    cursor,
  };
}
