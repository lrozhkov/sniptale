import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  ROW_REFERENCE_INDEX,
  UNKNOWN_HISTORY_REFERENCES,
  UNKNOWN_MEDIA_REFERENCES,
  rowReferenceKey,
} from '../infrastructure/indexed-db/row-index-contract';
import { materializeWorkspaceHead } from '../review-workspaces/storage';
import {
  mediaDependencyTarget,
  scenarioChildUsesMedia,
  type MediaDependencyTarget,
} from './dependencies';
import { parseScenarioAssetEntry } from '../scenario/read-guards';

interface DependencyReadTransaction {
  objectStore(name: string): {
    get(key: IDBValidKey): Promise<unknown>;
    index(name: string): { getAll(key: IDBValidKey): Promise<unknown[]> };
  };
}

/** Native locators select candidates; callers still admit each source in their own snapshot. */
async function matchingRows(
  tx: DependencyReadTransaction,
  name: string,
  keys: readonly string[]
): Promise<unknown[]> {
  const result = new Map<string, unknown>();
  const batches = await Promise.all(
    [...new Set(keys)].map((key) => tx.objectStore(name).index(ROW_REFERENCE_INDEX).getAll(key))
  );
  for (const batch of batches)
    for (const row of batch) {
      const key = isRecord(row) ? (row['id'] ?? row['aggregateId'] ?? row['jobId']) : undefined;
      result.set(typeof key === 'string' ? key : JSON.stringify(row), row);
    }
  return [...result.values()];
}

function targetKeys(media: MediaDependencyTarget, childIds: Iterable<string> = []): string[] {
  return [
    rowReferenceKey('media', media.id),
    ...(media.source.kind === 'recording'
      ? [rowReferenceKey('recording', media.source.recordingId)]
      : []),
    ...(media.source.kind === 'project-asset'
      ? [rowReferenceKey('project-asset', media.source.projectAssetId)]
      : []),
    ...[...(media.privateProjectAssetIds ?? [])].map((id) => rowReferenceKey('project-asset', id)),
    ...[...childIds].map((id) => rowReferenceKey('scenario-asset', id)),
  ];
}

/** Include unknown heads and orphan history rather than treating missing locators as absence. */
async function matchingReviews(
  tx: DependencyReadTransaction,
  keys: readonly string[]
): Promise<unknown[]> {
  const [heads, pendingHistory] = await Promise.all([
    matchingRows(tx, 'video_workspaces', [...keys, UNKNOWN_HISTORY_REFERENCES]),
    tx
      .objectStore('video_workspace_history')
      .index(ROW_REFERENCE_INDEX)
      .getAll(UNKNOWN_HISTORY_REFERENCES),
  ]);
  const byId = new Map<string, unknown>();
  const opaque: unknown[] = [];
  for (const head of heads) {
    if (isRecord(head) && typeof head['aggregateId'] === 'string')
      byId.set(head['aggregateId'], head);
    else opaque.push(head);
  }
  for (const row of pendingHistory) {
    if (!isRecord(row) || typeof row['aggregateId'] !== 'string') {
      opaque.push({ historyEvidence: [row] });
      continue;
    }
    const id = row['aggregateId'];
    if (byId.has(id)) continue;
    const head = await tx.objectStore('video_workspaces').get(id);
    if (head === undefined)
      opaque.push({ aggregateId: id, formatVersion: 2, historyEvidence: [row] });
    else byId.set(id, head);
  }
  return [
    ...opaque,
    ...(await Promise.all([...byId.values()].map((head) => materializeWorkspaceHead(tx, head)))),
  ];
}

/** Resolve only this identity's private acquisitions, scenario aliases and retained consumers. */
export async function readDeletionDependencyRows(
  tx: DependencyReadTransaction,
  root: MediaDependencyTarget
) {
  const projectAssets = await matchingRows(tx, 'project_assets', [
    rowReferenceKey('media', root.id),
    UNKNOWN_MEDIA_REFERENCES,
  ]);
  const target = mediaDependencyTarget(root, projectAssets);
  const children = await matchingRows(tx, 'scenario_assets', [
    rowReferenceKey('media', root.id),
    UNKNOWN_MEDIA_REFERENCES,
  ]);
  const childIds = children
    .map(parseScenarioAssetEntry)
    .filter(
      (child): child is NonNullable<typeof child> =>
        child !== null && scenarioChildUsesMedia(child, target)
    )
    .map((child) => child.id);
  const keys = targetKeys(target, childIds);
  const [videos, reviews] = await Promise.all([
    matchingRows(tx, 'video_projects', [...keys, UNKNOWN_MEDIA_REFERENCES]),
    matchingReviews(tx, keys),
  ]);
  return { target, projectAssets, children, videos, reviews };
}

/** Detached export handoffs retain private sources even when no editor session is open. */
export function readDeletionExportInputRows(
  tx: DependencyReadTransaction,
  target: MediaDependencyTarget
): Promise<unknown[]> {
  return matchingRows(tx, 'project_export_inputs', [
    ...targetKeys(target),
    UNKNOWN_MEDIA_REFERENCES,
  ]);
}

/** Select scenario origins and child consumers in the caller's mutation snapshot. */
export function readScenarioVideoDependencyRows(
  tx: DependencyReadTransaction,
  projectId: string,
  childIds: ReadonlySet<string>,
  removeProject: boolean
): Promise<unknown[]> {
  return matchingRows(tx, 'video_projects', [
    ...(removeProject ? [rowReferenceKey('scenario-project', projectId)] : []),
    ...[...childIds].map((id) => rowReferenceKey('scenario-asset', id)),
    UNKNOWN_MEDIA_REFERENCES,
  ]);
}
