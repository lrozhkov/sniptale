import type { VideoWorkspace } from './contracts';
import { withoutVideoWorkspaceTyping } from './typing';

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
