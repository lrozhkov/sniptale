import { createReviewAdvancedContentOperation } from '../../../features/video/review/document';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { VideoWorkspace } from './contracts';

/** Physical v2 stores legacy logical v1; physical v3 stores a complete logical v2 baseline. */
export type VideoWorkspaceHead = Omit<
  VideoWorkspace,
  'formatVersion' | 'history' | 'advanced' | 'effectSnapshots' | 'baseline'
> & {
  formatVersion: 2 | 3;
  historyStart?: number;
  historyLength: number;
  usageReferenceKeys: string[];
};

/** Ordinal zero retains the advanced baseline; positive ordinals retain immutable operations. */
export type VideoWorkspaceHistoryRow =
  | {
      aggregateId: string;
      ordinal: 0;
      advanced: VideoWorkspace['advanced'];
      effectSnapshots?: VideoWorkspace['effectSnapshots'];
    }
  | {
      aggregateId: string;
      ordinal: 0;
      baseline: NonNullable<VideoWorkspace['baseline']>;
      ui: VideoWorkspace['advanced']['ui'];
      recoveryV1?: VideoWorkspace['advanced']['recoveryV1'];
      effectSnapshots?: VideoWorkspace['effectSnapshots'];
    }
  | { aggregateId: string; ordinal: number; operation: VideoWorkspace['history'][number] };

/** Reconstructs unknown logical input without admitting history or repairing stored evidence. */
export function materializeWorkspaceStorage(head: unknown, rows: readonly unknown[]): unknown {
  if (!isRecord(head) || (head['formatVersion'] !== 2 && head['formatVersion'] !== 3)) {
    return rows.length ? { aggregateId: isRecord(head) ? head['aggregateId'] : undefined } : head;
  }
  const count = head['historyLength'];
  const complete = head['formatVersion'] === 3;
  const start = complete ? head['historyStart'] : 0;
  if (
    typeof head['aggregateId'] !== 'string' ||
    typeof count !== 'number' ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    typeof start !== 'number' ||
    !Number.isSafeInteger(start) ||
    start < 0 ||
    !Number.isSafeInteger(start + count) ||
    rows.length !== count + 1 ||
    'history' in head ||
    'advanced' in head ||
    'effectSnapshots' in head ||
    'baseline' in head ||
    'ui' in head
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
      (row['ordinal'] !== 0 && (row['ordinal'] <= start || row['ordinal'] > start + count)) ||
      ordered.has(row['ordinal'])
    )
      return head;
    if (
      row['ordinal'] === 0
        ? (complete
            ? !('baseline' in row) || !('ui' in row) || 'advanced' in row
            : !('advanced' in row) || 'baseline' in row || 'ui' in row) || 'operation' in row
        : !('operation' in row) ||
          'advanced' in row ||
          'effectSnapshots' in row ||
          'baseline' in row ||
          'ui' in row
    )
      return head;
    ordered.set(row['ordinal'], row);
  }
  const history: unknown[] = [];
  for (let ordinal = start + 1; ordinal <= start + count; ordinal++) {
    const row = ordered.get(ordinal);
    if (!row) return head;
    history.push(row['operation']);
  }
  const baseline = ordered.get(0);
  if (!baseline) return head;
  const { historyLength: _count, historyStart: _start, ...envelope } = head;
  const document = baseline['baseline'];
  if (complete && (!isRecord(document) || !isRecord(document['advancedContent']))) return head;
  return {
    ...envelope,
    formatVersion: complete ? 2 : 1,
    advanced:
      complete && isRecord(document) && isRecord(document['advancedContent'])
        ? {
            ...document['advancedContent'],
            ui: baseline['ui'],
            ...(baseline['recoveryV1'] === undefined ? {} : { recoveryV1: baseline['recoveryV1'] }),
          }
        : baseline['advanced'],
    ...(complete ? { baseline: document } : {}),
    ...(baseline['effectSnapshots'] === undefined
      ? {}
      : { effectSnapshots: baseline['effectSnapshots'] }),
    history,
  };
}

/** Encodes already admitted state; reference keys are derived by the existing logical owner. */
export function workspaceStorageHead(
  workspace: VideoWorkspace,
  usageReferenceKeys: string[],
  historyStart = 0
): VideoWorkspaceHead {
  const {
    history,
    advanced: _baseline,
    effectSnapshots: _snapshots,
    formatVersion: _format,
    baseline: _document,
    ...envelope
  } = workspace;
  return {
    ...envelope,
    formatVersion: workspace.formatVersion === 2 ? 3 : 2,
    ...(workspace.formatVersion === 2 ? { historyStart } : {}),
    historyLength: history.length,
    usageReferenceKeys,
  };
}

/** Explicit replacement writes a baseline and every admitted retained operation. */
export function workspaceStorageRows(
  workspace: VideoWorkspace,
  historyStart = 0
): VideoWorkspaceHistoryRow[] {
  return [
    {
      aggregateId: workspace.aggregateId,
      ordinal: 0,
      ...(workspace.formatVersion === 2 && workspace.baseline
        ? {
            baseline: workspace.baseline,
            ui: workspace.advanced.ui,
            ...(workspace.advanced.recoveryV1 === undefined
              ? {}
              : { recoveryV1: workspace.advanced.recoveryV1 }),
          }
        : { advanced: workspace.advanced }),
      ...(workspace.effectSnapshots ? { effectSnapshots: workspace.effectSnapshots } : {}),
    },
    ...workspace.history.map((operation, index) => ({
      aggregateId: workspace.aggregateId,
      ordinal: historyStart + index + 1,
      operation:
        operation.target === 'advancedContent'
          ? (createReviewAdvancedContentOperation(operation) ?? operation)
          : operation,
    })),
  ];
}
