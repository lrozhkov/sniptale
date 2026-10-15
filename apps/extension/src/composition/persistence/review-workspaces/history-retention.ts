import { selectHistoryRetentionWindow } from '@sniptale/foundation/history/retention';
import { sameHistoryArray, sameHistoryRecord } from '@sniptale/foundation/history/equal';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { EDITOR_HISTORY_LIMITS } from '../../../features/editor-history/policy';
import {
  replayReviewHistory,
  reviewDocumentBaseline,
} from '../../../features/video/review/document';
import type { VideoWorkspace } from './contracts';

const encoder = new TextEncoder();

/** Structural equality of admitted workspace history and baseline values. */
export function sameReviewWorkspaceValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return sameHistoryArray(left, right, sameReviewWorkspaceValue);
  if (!isRecord(left) || !isRecord(right) || Array.isArray(left) || Array.isArray(right))
    return false;
  return sameHistoryRecord(left, right, sameReviewWorkspaceValue);
}

/** Selects a physical prefix only when the admitted replacement preserves its complete baseline. */
export function retainedWorkspaceReplacementStart(
  previous: VideoWorkspace,
  next: VideoWorkspace
): number | undefined {
  const baseline = reviewDocumentBaseline(next);
  if (sameReviewWorkspaceValue(reviewDocumentBaseline(previous), baseline)) return 0;
  const first = next.history[0];
  const start = first
    ? previous.history.findIndex((operation) => operation.id === first.id)
    : previous.cursor;
  if (start < 0) return undefined;
  const retainedBaseline = replayReviewHistory(
    previous.history,
    start,
    previous.source,
    reviewDocumentBaseline(previous)
  );
  return sameReviewWorkspaceValue(retainedBaseline, baseline) ? start : undefined;
}

/** Compacts a fully admitted graph in its owner mutation; current content is always retained. */
export function compactVideoWorkspaceHistory(workspace: VideoWorkspace) {
  const window = selectHistoryRetentionWindow(
    workspace.history.map((operation) => ({
      actions: 1,
      bytes: encoder.encode(JSON.stringify(operation)).byteLength + 1,
    })),
    workspace.cursor,
    { ...EDITOR_HISTORY_LIMITS, maxBytes: EDITOR_HISTORY_LIMITS.maxBytes - 1 }
  );
  const changed = window.start > 0 || window.end < workspace.history.length;
  if (!changed) return { workspace, start: 0, end: workspace.history.length };
  const baseline = replayReviewHistory(
    workspace.history,
    window.start,
    workspace.source,
    reviewDocumentBaseline(workspace)
  );
  const next: VideoWorkspace = {
    ...workspace,
    formatVersion: workspace.project ? 4 : 2,
    baseline,
    advanced: {
      ...baseline.advancedContent,
      ui: workspace.advanced.ui,
      ...(workspace.advanced.recoveryV1 ? { recoveryV1: workspace.advanced.recoveryV1 } : {}),
    },
    history: workspace.history.slice(window.start, window.end),
    cursor: window.cursor,
    ...(workspace.typing && window.start === workspace.history.length
      ? { typing: { ...workspace.typing, operationId: null } }
      : {}),
  };
  return { workspace: next, start: window.start, end: window.end };
}
