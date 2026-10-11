import { createReviewAdvancedContentOperation } from '../../../features/video/review/document';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { VideoWorkspace } from './contracts';

/** Private storage envelope; logical session and portable values remain format 1. */
export type VideoWorkspaceHead = Omit<VideoWorkspace, 'formatVersion' | 'history' | 'advanced'> & {
  formatVersion: 2;
  historyLength: number;
  usageReferenceKeys: string[];
};

/** Ordinal zero retains the advanced baseline; positive ordinals retain immutable operations. */
export type VideoWorkspaceHistoryRow =
  | { aggregateId: string; ordinal: 0; advanced: VideoWorkspace['advanced'] }
  | { aggregateId: string; ordinal: number; operation: VideoWorkspace['history'][number] };

/** Reconstructs unknown logical input without admitting history or repairing stored evidence. */
export function materializeWorkspaceStorage(head: unknown, rows: readonly unknown[]): unknown {
  if (!isRecord(head) || head['formatVersion'] !== 2) {
    return rows.length ? { aggregateId: isRecord(head) ? head['aggregateId'] : undefined } : head;
  }
  const count = head['historyLength'];
  if (
    typeof head['aggregateId'] !== 'string' ||
    typeof count !== 'number' ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    rows.length !== count + 1 ||
    'history' in head ||
    'advanced' in head
  )
    return head;
  const ordered = new Map<number, Record<string, unknown>>();
  for (const row of rows) {
    if (
      !isRecord(row) ||
      row['aggregateId'] !== head['aggregateId'] ||
      typeof row['ordinal'] !== 'number' ||
      !Number.isSafeInteger(row['ordinal']) ||
      row['ordinal'] < 0 ||
      row['ordinal'] > count ||
      ordered.has(row['ordinal'])
    )
      return head;
    if (
      row['ordinal'] === 0
        ? !('advanced' in row) || 'operation' in row
        : !('operation' in row) || 'advanced' in row
    )
      return head;
    ordered.set(row['ordinal'], row);
  }
  const history: unknown[] = [];
  for (let ordinal = 1; ordinal <= count; ordinal++) {
    const row = ordered.get(ordinal);
    if (!row) return head;
    history.push(row['operation']);
  }
  const baseline = ordered.get(0);
  if (!baseline) return head;
  const { historyLength: _count, ...envelope } = head;
  return { ...envelope, formatVersion: 1, advanced: baseline['advanced'], history };
}

/** Encodes already admitted state; reference keys are derived by the existing logical owner. */
export function workspaceStorageHead(
  workspace: VideoWorkspace,
  usageReferenceKeys: string[]
): VideoWorkspaceHead {
  const { history, advanced: _baseline, formatVersion: _format, ...envelope } = workspace;
  return { ...envelope, formatVersion: 2, historyLength: history.length, usageReferenceKeys };
}

/** Explicit replacement writes a baseline and every admitted retained operation. */
export function workspaceStorageRows(workspace: VideoWorkspace): VideoWorkspaceHistoryRow[] {
  return [
    { aggregateId: workspace.aggregateId, ordinal: 0, advanced: workspace.advanced },
    ...workspace.history.map((operation, index) => ({
      aggregateId: workspace.aggregateId,
      ordinal: index + 1,
      operation:
        operation.target === 'advancedContent'
          ? (createReviewAdvancedContentOperation(operation) ?? operation)
          : operation,
    })),
  ];
}
