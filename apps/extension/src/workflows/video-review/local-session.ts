import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import {
  parseVideoWorkspace,
  parseVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/parser';
import type {
  ReviewAnnotation,
  ReviewHistoryDirection,
  ReviewOperation,
} from '../../features/video/review/types';

/** Page-local operations use the same canonical snapshot validation as durable recovery. */
export type LocalReviewChange =
  | { kind: 'reset' }
  | { kind: 'advanced'; advanced: unknown }
  | { kind: 'draft'; annotation: ReviewAnnotation | null; before: ReviewAnnotation | null }
  | { kind: 'commit'; operation: ReviewOperation; consumeDraft: boolean }
  | { kind: 'history'; direction: ReviewHistoryDirection };

/** Derives an editable buffer without advancing either durable revision. */
export function applyLocalReviewChange(
  snapshot: VideoWorkspaceSnapshot,
  change: LocalReviewChange
): VideoWorkspaceSnapshot {
  let { workspace, draft } = snapshot;
  if (change.kind === 'reset') {
    workspace = {
      ...workspace,
      history: [],
      cursor: 0,
      advanced: { ...createQuickEditAdvancedState(), ui: workspace.advanced.ui },
    };
    draft = null;
  } else if (change.kind === 'advanced') {
    const next = parseVideoWorkspace({ ...workspace, advanced: change.advanced });
    if (!next) throw new Error('Invalid review state');
    workspace = next;
  } else if (change.kind === 'draft') {
    draft =
      change.annotation === null
        ? null
        : parseVideoWorkspaceDraft(
            {
              aggregateId: workspace.aggregateId,
              revision: draft?.revision ?? 1,
              annotation: change.annotation,
              before: change.before,
              updatedAt: Date.now(),
            },
            workspace.source.duration
          );
    if (change.annotation !== null && !draft) throw new Error('Invalid review draft');
  } else if (change.kind === 'history') {
    workspace = {
      ...workspace,
      cursor:
        change.direction === 'start'
          ? 0
          : Math.max(
              0,
              Math.min(
                workspace.history.length,
                workspace.cursor + (change.direction === 'undo' ? -1 : 1)
              )
            ),
    };
  } else {
    if (
      change.consumeDraft &&
      (!draft ||
        change.operation.target !== 'annotation' ||
        JSON.stringify(change.operation.after) !== JSON.stringify(draft.annotation) ||
        JSON.stringify(change.operation.before) !== JSON.stringify(draft.before))
    ) {
      throw new Error('Review draft is unavailable');
    }
    const operation =
      change.operation.target === 'edit'
        ? {
            ...change.operation,
            preserveFocusAnchors: true as const,
            preserveUnderCuts: true as const,
            preserveVoiceoverAnchors: true as const,
            normalizeVoiceoverTempo: true as const,
          }
        : change.operation;
    workspace = {
      ...workspace,
      history: [...workspace.history.slice(0, workspace.cursor), operation],
      cursor: workspace.cursor + 1,
    };
    if (change.consumeDraft) draft = null;
  }
  const parsed = parseVideoWorkspace(workspace);
  if (!parsed) throw new Error('Invalid review workspace');
  return { workspace: parsed, draft };
}
