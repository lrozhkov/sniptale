import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseReviewSource } from '../../../features/video/review/validation';
import type { ReviewSource } from '../../../features/video/review/types';
import {
  initDB,
  MEDIA_LIBRARY_STORE,
  VIDEO_WORKSPACES_STORE,
  STORE_NAME,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
} from '../infrastructure/indexed-db/core';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseProjectAssetEntry, parseProjectExportEntry } from '../projects/read-guards';
import { parseWorkspaceProject } from './project-metadata';
import type { VideoWorkspaceProject } from './contracts';

export interface VideoWorkspaceSummary {
  aggregateId: string;
  name: string;
  lifecycle: VideoWorkspaceProject['lifecycle'];
  createdAt: number;
  updatedAt: number;
  revision: number;
  source: ReviewSource | null;
  unavailableReason: 'invalid-workspace' | 'missing-source' | 'changed-source' | null;
}

type Transaction = ReturnType<Awaited<ReturnType<typeof initDB>>['transaction']>;
const timestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function summaryHistoryCount(raw: Record<string, unknown>): number | null {
  if (!('historyLength' in raw)) {
    return !('historyStart' in raw) && Array.isArray(raw['history']) ? raw['history'].length : null;
  }
  if (['history', 'advanced', 'effectSnapshots', 'baseline', 'ui'].some((key) => key in raw))
    return null;
  const count = raw['historyLength'];
  const complete = raw['formatVersion'] === 3 || raw['formatVersion'] === 5;
  const start = complete ? raw['historyStart'] : 0;
  return typeof count === 'number' &&
    Number.isSafeInteger(count) &&
    count >= 0 &&
    typeof start === 'number' &&
    Number.isSafeInteger(start) &&
    start >= 0 &&
    Number.isSafeInteger(start + count)
    ? count
    : null;
}

function isSummaryEnvelope(
  raw: Record<string, unknown>,
  project: VideoWorkspaceProject | null
): boolean {
  const version = raw['formatVersion'];
  const physical = 'historyLength' in raw;
  const versions = physical ? [2, 3, 4, 5] : [1, 2, 3, 4];
  if (typeof version !== 'number' || !versions.includes(version)) return false;
  const requiresProject = physical ? version >= 4 : version >= 3;
  if (requiresProject ? !project : 'project' in raw) return false;
  const count = summaryHistoryCount(raw);
  const cursor = raw['cursor'];
  const revision = raw['revision'];
  return (
    typeof count === 'number' &&
    Number.isSafeInteger(count) &&
    count >= 0 &&
    typeof cursor === 'number' &&
    Number.isSafeInteger(cursor) &&
    cursor >= 0 &&
    cursor <= count &&
    typeof revision === 'number' &&
    Number.isSafeInteger(revision) &&
    revision > 0 &&
    timestamp(raw['createdAt']) &&
    timestamp(raw['updatedAt']) &&
    raw['updatedAt'] >= raw['createdAt'] &&
    typeof raw['sourceAssetId'] === 'string' &&
    raw['sourceAssetId'].length > 0 &&
    raw['sourceAssetId'].length <= 256
  );
}

async function readSummarySource(
  tx: Transaction,
  source: import('../media-library/contracts').MediaAssetSource
) {
  switch (source.kind) {
    case 'recording':
      return parseRecordingEntry(await tx.objectStore(STORE_NAME).get(source.recordingId));
    case 'project-asset':
      return parseProjectAssetEntry(
        await tx.objectStore(PROJECT_ASSETS_STORE).get(source.projectAssetId)
      );
    case 'project-export':
      return parseProjectExportEntry(
        await tx.objectStore(PROJECT_EXPORTS_STORE).get(source.exportId)
      );
    case 'screenshot':
    case 'stored-asset':
    case 'web-snapshot':
      return null;
  }
}

async function summarizeHead(tx: Transaction, raw: unknown): Promise<VideoWorkspaceSummary | null> {
  if (
    !isRecord(raw) ||
    typeof raw['aggregateId'] !== 'string' ||
    !raw['aggregateId'] ||
    raw['aggregateId'].length > 256
  )
    return null;
  const aggregateId = raw['aggregateId'];
  const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(aggregateId));
  const project = parseWorkspaceProject(raw['project']);
  const source = parseReviewSource(raw['source']);
  const createdAt = timestamp(raw['createdAt']) ? raw['createdAt'] : 0;
  const updatedAt = timestamp(raw['updatedAt']) ? raw['updatedAt'] : createdAt;
  const revision =
    typeof raw['revision'] === 'number' &&
    Number.isSafeInteger(raw['revision']) &&
    raw['revision'] > 0
      ? raw['revision']
      : 0;
  const validEnvelope = isSummaryEnvelope(raw, project);
  const sourceRow = media ? await readSummarySource(tx, media.source) : null;
  return {
    aggregateId,
    name: project?.name ?? media?.filename ?? aggregateId,
    lifecycle: project?.lifecycle ?? { storageClass: 'library', savedAt: createdAt, updatedAt },
    createdAt,
    updatedAt,
    revision,
    source,
    unavailableReason:
      !validEnvelope || !source
        ? 'invalid-workspace'
        : !media || !media.mimeType.startsWith('video/') || !sourceRow
          ? 'missing-source'
          : sourceRow.assetId !== raw['sourceAssetId']
            ? 'changed-source'
            : null,
  };
}

/** Read project metadata and source locators without history, bytes, recovery or mutation. */
export async function listVideoWorkspaceSummaries(): Promise<VideoWorkspaceSummary[]> {
  const db = await initDB();
  const tx = db.transaction(
    [
      VIDEO_WORKSPACES_STORE,
      MEDIA_LIBRARY_STORE,
      STORE_NAME,
      PROJECT_ASSETS_STORE,
      PROJECT_EXPORTS_STORE,
    ],
    'readonly'
  );
  const heads = await tx.objectStore(VIDEO_WORKSPACES_STORE).getAll();
  const summaries = await Promise.all(heads.map((head) => summarizeHead(tx, head)));
  await tx.done;
  return summaries.filter((summary) => summary !== null);
}
