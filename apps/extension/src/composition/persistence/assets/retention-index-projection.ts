import { isCursorTrajectoryHead } from '../recordings/cursor-trajectory/guards';
import { RECORDING_CURSOR_SNAPSHOT_ROLE } from '../recordings/cursor-trajectory/contracts';
import { isRecordingEventsHead } from '../recordings/recording-events/guards';
import { RECORDING_EVENTS_SNAPSHOT_ROLE } from '../recordings/recording-events/contracts';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { collectSyncCaptureClaims } from '../sync-capture/claims';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseProjectAssetEntry, parseProjectExportEntry } from '../projects/read-guards';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseScenarioAssetEntry, parseScenarioExportEntry } from '../scenario/read-guards';
import { parseImageWorkspaceEntry } from '../image-workspaces/parser';
import { parseScenarioStepEditorDocumentEntry } from '../scenario/editor-documents/index.guards';
import { parseStoredWebSnapshotRecord } from '../web-snapshots/guards';
import { parseVideoDependencyEnvelope, videoSourceReferences } from '../media-library/dependencies';
import {
  stripRowReferenceMetadata,
  rowReferenceKey,
  UNKNOWN_ASSET_REFERENCES,
  UNKNOWN_HISTORY_REFERENCES,
  UNKNOWN_MEDIA_REFERENCES,
} from '../infrastructure/indexed-db/row-index-contract';
import {
  parseAssetOwner,
  parseAssetRef,
  parseArchiveRestoreSession,
  parseBackupAssetOperation,
  parsePhysicalDeleteAssetOperation,
} from './guards';
import type { AssetOwner } from './contracts';
import { collectBackupRollbackAssetIds } from './retention-claims';

interface RetentionRowProjection {
  valid: boolean;
  owners: AssetOwner[];
  rollbackAssetIds: string[];
  syncAssetIds: string[];
  publishedProjectAssetIds: string[];
}

function bodyOwners(
  ownerKind: string,
  entry: { id: string; assetId: string } | null
): AssetOwner[] | null {
  return entry ? [{ ownerKind, ownerId: entry.id, assetId: entry.assetId, role: 'body' }] : null;
}

function documentOwners(store: string, raw: unknown): AssetOwner[] | null {
  if (store === 'image_workspaces') {
    const entry = parseImageWorkspaceEntry(raw);
    return entry
      ? entry.document.assets.map((asset) => ({
          ownerKind: 'image-workspace',
          ownerId: entry.aggregateId,
          assetId: asset.assetId,
          role: asset.role,
        }))
      : null;
  }
  if (store === 'scenario_step_editor_documents') {
    const entry = parseScenarioStepEditorDocumentEntry(raw);
    return entry
      ? entry.document.assets.map((asset) => ({
          ownerKind: 'scenario-editor-document',
          ownerId: entry.stepId,
          assetId: asset.assetId,
          role: asset.role,
        }))
      : null;
  }
  if (store === 'web_snapshots') {
    const entry = parseStoredWebSnapshotRecord(raw);
    return entry
      ? [
          {
            ownerKind: 'web-snapshot',
            ownerId: entry.id,
            assetId: entry.packageAssetId,
            role: 'package',
          },
          {
            ownerKind: 'web-snapshot',
            ownerId: entry.id,
            assetId: entry.screenshotAssetId,
            role: 'screenshot',
          },
        ]
      : null;
  }
  return [];
}

function sourceOwners(store: string, raw: unknown): AssetOwner[] | null {
  switch (store) {
    case 'recording_cursor_trajectories':
    case 'recording_events': {
      const cursor = store === 'recording_cursor_trajectories';
      if (cursor && (!isRecord(raw) || !Object.hasOwn(raw, 'snapshotAssetId'))) return [];
      if (!isRecord(raw)) return null;
      if (!(cursor ? isCursorTrajectoryHead(raw) : isRecordingEventsHead(raw))) return null;
      if (!Object.hasOwn(raw, 'snapshotAssetId')) return [];
      if (raw['retired'] === true) return [];
      const assetId = raw['snapshotAssetId'];
      const ownerId = raw['recordingId'];
      if (typeof assetId !== 'string' || !assetId || typeof ownerId !== 'string') return null;
      return [
        {
          ownerKind: 'recording',
          ownerId,
          assetId,
          role: cursor ? RECORDING_CURSOR_SNAPSHOT_ROLE : RECORDING_EVENTS_SNAPSHOT_ROLE,
        },
      ];
    }
    case 'recordings':
      return bodyOwners('recording', parseRecordingEntry(raw));
    case 'project_assets':
      return bodyOwners('project-asset', parseProjectAssetEntry(raw));
    case 'project_exports':
      return bodyOwners('project-export', parseProjectExportEntry(raw));
    case 'scenario_assets':
      return bodyOwners('scenario-asset', parseScenarioAssetEntry(raw));
    case 'scenario_exports': {
      const entry = parseScenarioExportEntry(raw);
      return entry
        ? entry.html
          ? bodyOwners('scenario-export', { id: entry.id, assetId: entry.html.assetId })
          : []
        : null;
    }
    default:
      return documentOwners(store, raw);
  }
}

function projectLibraryClaims(raw: unknown, result: RetentionRowProjection): void {
  const entry = parseMediaLibraryEntry(raw);
  if (!entry) {
    result.valid = false;
    return;
  }
  if (entry.source.kind === 'stored-asset')
    result.owners.push({
      ownerKind: 'media-library',
      ownerId: entry.id,
      assetId: entry.source.assetId,
      role: 'source',
    });
  else if (entry.source.kind === 'project-asset')
    result.publishedProjectAssetIds.push(entry.source.projectAssetId);
}

function projectOperationClaims(raw: unknown, result: RetentionRowProjection): void {
  const backup = parseBackupAssetOperation(raw);
  result.valid =
    backup !== null ||
    parseArchiveRestoreSession(raw) !== null ||
    parsePhysicalDeleteAssetOperation(raw) !== null;
  if (backup) result.rollbackAssetIds.push(...collectBackupRollbackAssetIds(backup));
}

/** One canonical row's physical claims, shared by native locators and explicit audits. */
export function projectRetentionRow(store: string, raw: unknown): RetentionRowProjection {
  raw = stripRowReferenceMetadata(raw);
  const owners = sourceOwners(store, raw);
  const result: RetentionRowProjection = {
    valid: owners !== null,
    owners: owners ?? [],
    rollbackAssetIds: [],
    syncAssetIds: [],
    publishedProjectAssetIds: [],
  };
  switch (store) {
    case 'media_library':
      projectLibraryClaims(raw, result);
      break;
    case 'asset_refs':
      result.valid = parseAssetRef(raw) !== null;
      break;
    case 'asset_owners':
      result.valid = parseAssetOwner(raw) !== null;
      break;
    case 'asset_operations':
      projectOperationClaims(raw, result);
      break;
    case 'sync_capture': {
      const claims = collectSyncCaptureClaims([raw]);
      result.valid = claims.valid;
      result.syncAssetIds.push(...claims.assetIds);
      break;
    }
  }
  return result;
}

function appendProjectDependencyKeys(store: string, raw: unknown, keys: Set<string>): void {
  if (store === 'video_projects' || store === 'project_export_inputs') {
    const envelope = parseVideoDependencyEnvelope(raw);
    if (!envelope) keys.add(UNKNOWN_MEDIA_REFERENCES);
    else {
      if (envelope.baseRecordingId !== null)
        keys.add(rowReferenceKey('recording', envelope.baseRecordingId));
      if (envelope.source.kind === 'recording')
        keys.add(rowReferenceKey('recording', envelope.source.recordingId));
      if (envelope.source.kind === 'scenario')
        keys.add(rowReferenceKey('scenario-project', envelope.source.scenarioProjectId));
      for (const source of envelope.sources)
        for (const ref of videoSourceReferences(source)) {
          keys.add(rowReferenceKey(ref.kind === 'library-asset' ? 'media' : ref.kind, ref.id));
        }
    }
  }
}

function appendPrivateOriginKeys(store: string, raw: unknown, keys: Set<string>): void {
  if (store === 'project_assets') {
    if (
      !isRecord(raw) ||
      (raw['originMediaId'] !== undefined &&
        (typeof raw['originMediaId'] !== 'string' || !raw['originMediaId']))
    )
      keys.add(UNKNOWN_MEDIA_REFERENCES);
    else if (typeof raw['originMediaId'] === 'string')
      keys.add(rowReferenceKey('media', raw['originMediaId']));
  }
}

function appendScenarioOriginKeys(store: string, raw: unknown, keys: Set<string>): void {
  if (store === 'scenario_assets') {
    if (
      !isRecord(raw) ||
      typeof raw['id'] !== 'string' ||
      typeof raw['assetId'] !== 'string' ||
      (raw['galleryAssetId'] !== null && typeof raw['galleryAssetId'] !== 'string') ||
      (raw['borrowedMediaId'] !== undefined && typeof raw['borrowedMediaId'] !== 'string')
    )
      keys.add(UNKNOWN_MEDIA_REFERENCES);
    else {
      if (typeof raw['galleryAssetId'] === 'string')
        keys.add(rowReferenceKey('media', raw['galleryAssetId']));
      if (typeof raw['borrowedMediaId'] === 'string')
        keys.add(rowReferenceKey('media', raw['borrowedMediaId']));
      else keys.add(rowReferenceKey('media', `scenario-asset:${raw['id']}`));
    }
  }
}

/** Reference envelopes tolerate unrelated render errors but never unknown source locators. */
export function projectRowReferenceKeys(store: string, raw: unknown): string[] {
  raw = stripRowReferenceMetadata(raw);
  const projection = projectRetentionRow(store, raw);
  const keys = new Set<string>();
  if (!projection.valid) keys.add(UNKNOWN_ASSET_REFERENCES);
  for (const id of [...projection.rollbackAssetIds, ...projection.syncAssetIds])
    keys.add(rowReferenceKey('asset', id));
  for (const owner of projection.owners) {
    keys.add(rowReferenceKey('asset', owner.assetId));
  }
  for (const id of projection.publishedProjectAssetIds)
    keys.add(rowReferenceKey('project-asset', id));
  if (store === 'asset_refs') {
    const ref = parseAssetRef(raw);
    if (ref) keys.add(rowReferenceKey('asset', ref.assetId));
  }
  if (store === 'asset_owners') {
    const owner = parseAssetOwner(raw);
    if (owner) keys.add(rowReferenceKey('asset', owner.assetId));
  }
  appendProjectDependencyKeys(store, raw, keys);
  appendPrivateOriginKeys(store, raw, keys);
  appendScenarioOriginKeys(store, raw, keys);
  // A head/history pair needs scoped admission in the workspace storage owner.
  if (store === 'video_workspaces' || store === 'video_workspace_history')
    keys.add(UNKNOWN_HISTORY_REFERENCES);
  return [...keys];
}
