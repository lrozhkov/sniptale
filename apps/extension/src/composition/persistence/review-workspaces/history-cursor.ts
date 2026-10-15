import { reviewHistoryTrackControls } from '../../../features/video/review/advanced/track-controls';
import type { VideoWorkspace } from './contracts';
import { withoutVideoWorkspaceTyping } from './typing';

/** Moves the cursor and legacy-backed masters in one candidate for local and durable history. */
export function moveReviewWorkspaceCursor(
  workspace: VideoWorkspace,
  requested: number
): VideoWorkspace {
  const cursor = Math.max(0, Math.min(workspace.history.length, requested));
  const forward = cursor > workspace.cursor;
  let ui = workspace.advanced.ui;
  for (
    let index = forward ? workspace.cursor : workspace.cursor - 1;
    forward ? index < cursor : index >= cursor;
    index += forward ? 1 : -1
  ) {
    const operation = workspace.history[index]!;
    if (operation.target !== 'advancedContent') continue;
    ui = reviewHistoryTrackControls(
      ui,
      forward ? operation.before : operation.after,
      forward ? operation.after : operation.before
    );
  }
  return {
    ...withoutVideoWorkspaceTyping(workspace),
    cursor,
    advanced: { ...workspace.advanced, ui },
  };
}
