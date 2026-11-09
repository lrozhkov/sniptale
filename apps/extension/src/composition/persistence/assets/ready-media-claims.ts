import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseProjectAssetEntry, parseVideoProjectMetadataEntry } from '../projects/read-guards';
import { parseCapturedMediaRows } from '../sync-capture/media-snapshot';
import { parsePreparedVideoReviewReplicaRoot } from '../sync-capture/prepared-review-parser';
import type { MediaDependencyTarget } from '../media-library/dependencies';
import type { AssetReadyJournal } from './contracts';

type MediaSource = MediaDependencyTarget['source'];
interface ReadyMediaTarget {
  id: string;
  source?:
    | Exclude<MediaSource, { kind: 'project-export' }>
    | { kind: 'project-export'; exportId: string; projectId?: string };
}
export type ReadyPublicationTarget =
  | ReadyMediaTarget
  | { id: string; projectAssetIds: readonly string[] };
export const UNKNOWN_READY_MEDIA = 'unknown:media';
const reference = (kind: string, id: string) => `${kind}:${id}`;

/** Unknown source slots retain the same source family that the existing publication guard protects. */
export function readyMediaTargetKeys(target: ReadyPublicationTarget): string[] {
  if ('projectAssetIds' in target)
    return [
      reference('project-export-owner', target.id),
      'unknown:project-export-owner',
      'unknown:project-asset',
      UNKNOWN_READY_MEDIA,
      ...target.projectAssetIds.flatMap((id) => [
        reference('project-asset', id),
        reference('media', `project-asset:${id}`),
      ]),
    ];
  const keys = [reference('media', target.id), UNKNOWN_READY_MEDIA];
  const source = target.source;
  if (!source) return keys;
  switch (source.kind) {
    case 'screenshot':
    case 'stored-asset':
      break;
    case 'recording':
      keys.push(reference('recording', source.recordingId), 'unknown:recording');
      break;
    case 'project-asset':
      keys.push(reference('project-asset', source.projectAssetId), 'unknown:project-asset');
      break;
    case 'project-export':
      keys.push(reference('project-export', source.exportId), 'unknown:project-export');
      break;
    case 'web-snapshot':
      keys.push(
        reference('web-snapshot', source.snapshotId),
        reference('web-snapshot-media', target.id),
        'unknown:web-snapshot'
      );
      break;
  }
  return keys;
}

function recordIdentity(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const id = value[key];
  return typeof id === 'string' && id ? id : null;
}
function identityKey(family: string, id: string | null): string {
  return id ? reference(family, id) : `unknown:${family}`;
}
function projectPublicationKeys(domain: string, payload: Record<string, unknown>): string[] {
  const entry = payload['entry'];
  const family = domain === 'project-assets' ? 'project-asset' : 'project-export';
  const keys = [identityKey(family, recordIdentity(entry, 'id'))];
  if (domain === 'project-exports') {
    keys.push(identityKey('project-export-owner', recordIdentity(entry, 'projectId')));
  } else if (isRecord(entry) && typeof entry['originMediaId'] === 'string') {
    keys.push(reference('media', entry['originMediaId']));
  }
  return keys;
}
function recordingPublicationKeys(payload: Record<string, unknown>): string[] {
  const entries = payload['entries'];
  if (!Array.isArray(entries)) return ['unknown:recording'];
  return [
    ...new Set(
      entries.map((entry: unknown) => identityKey('recording', recordIdentity(entry, 'id')))
    ),
  ];
}
function snapshotPublicationKeys(payload: Record<string, unknown>): string[] {
  const keys = [identityKey('web-snapshot', recordIdentity(payload['snapshot'], 'id'))];
  const media = payload['mediaEntry'];
  if (isRecord(media) && typeof media['id'] === 'string')
    keys.push(reference('web-snapshot-media', media['id']));
  return keys;
}
function unknownPublicationKeys(domain: string): string[] {
  switch (domain) {
    case 'project-assets':
      return ['unknown:project-asset'];
    case 'project-exports':
      return ['unknown:project-export', 'unknown:project-export-owner'];
    case 'recording-assets':
      return ['unknown:recording'];
    case 'web-snapshot-assets':
      return ['unknown:web-snapshot'];
    case 'image-workspace':
      return [UNKNOWN_READY_MEDIA];
    default:
      return [];
  }
}

/** Derive logical publication locators once at publication, never from imported index fields. */
export function collectReadyJournalMediaKeys(
  journal: Pick<AssetReadyJournal, 'domain' | 'payload'>
): string[] {
  const payload = journal.payload;
  if (journal.domain === 'sync-replica') return replicaMediaKeys(payload);
  if (!isRecord(payload)) return unknownPublicationKeys(journal.domain);
  switch (journal.domain) {
    case 'image-workspace':
      return [identityKey('media', recordIdentity(payload, 'aggregateId'))];
    case 'project-assets':
    case 'project-exports':
      return projectPublicationKeys(journal.domain, payload);
    case 'recording-assets':
      return recordingPublicationKeys(payload);
    case 'web-snapshot-assets':
      return snapshotPublicationKeys(payload);
    default:
      return [];
  }
}

/** The predicate and durable locators share one policy for pending source and sidecar publication. */
export function mediaHasPendingPublication(
  journal: Pick<AssetReadyJournal, 'domain' | 'payload'>,
  target: ReadyMediaTarget
): boolean {
  const keys = new Set(collectReadyJournalMediaKeys(journal));
  return readyMediaTargetKeys(target).some((key) => keys.has(key));
}

function replicaMediaKeys(payload: unknown): string[] {
  if (!isRecord(payload) || !isRecord(payload['input'])) return [UNKNOWN_READY_MEDIA];
  const input = payload['input'];
  if (payload['kind'] === 'image') {
    const media = input['media'];
    return isRecord(media) && typeof media['id'] === 'string' && media['id']
      ? [reference('media', media['id'])]
      : [UNKNOWN_READY_MEDIA];
  }
  if (payload['kind'] === 'media') {
    const rows = parseCapturedMediaRows(input['rows']);
    return rows ? [reference('media', rows.media.id)] : [UNKNOWN_READY_MEDIA];
  }
  if (payload['kind'] === 'video-review') return reviewReplicaMediaKeys(input);
  if (payload['kind'] !== 'video-project') return [UNKNOWN_READY_MEDIA];
  return projectReplicaMediaKeys(input);
}

function reviewReplicaMediaKeys(input: Record<string, unknown>): string[] {
  let root;
  try {
    root = parsePreparedVideoReviewReplicaRoot(input['root']);
  } catch {
    return [UNKNOWN_READY_MEDIA];
  }
  const dependencies = input['dependencies'];
  if (!Array.isArray(dependencies)) return [UNKNOWN_READY_MEDIA];
  const keys = new Set([reference('media', root.sourceMediaId)]);
  for (const dependency of dependencies) {
    if (!isRecord(dependency)) return [UNKNOWN_READY_MEDIA];
    const entry = parseMediaLibraryEntry(dependency['entry']);
    if (!entry) return [UNKNOWN_READY_MEDIA];
    keys.add(reference('media', entry.id));
  }
  for (const asset of root.assets) {
    if (asset.entry.originMediaId !== undefined)
      keys.add(reference('media', asset.entry.originMediaId));
    keys.add(reference('media', `project-asset:${asset.entry.id}`));
  }
  return [...keys];
}

function projectDependencyMediaKeys(dependencies: unknown[]): string[] | null {
  const keys: string[] = [];
  for (const dependency of dependencies) {
    if (!isRecord(dependency)) return null;
    const id = recordIdentity(dependency['entry'], 'id');
    if (!id) return null;
    keys.push(reference('media', id));
  }
  return keys;
}
function projectAssetMediaKeys(assets: unknown[]): string[] | null {
  const keys: string[] = [];
  for (const asset of assets) {
    if (!isRecord(asset)) return null;
    const entry = parseProjectAssetEntry(asset['entry']);
    if (!entry) return null;
    if (entry.originMediaId !== undefined) keys.push(reference('media', entry.originMediaId));
    keys.push(reference('media', `project-asset:${entry.id}`));
  }
  return keys;
}
function projectReplicaMediaKeys(input: Record<string, unknown>): string[] {
  const root = input['root'];
  const dependencies = input['dependencies'];
  if (!isRecord(root) || !Array.isArray(root['assets']) || !Array.isArray(dependencies))
    return [UNKNOWN_READY_MEDIA];
  const project = parseVideoProjectMetadataEntry(root['entry']);
  if (!project) return [UNKNOWN_READY_MEDIA];
  const dependencyKeys = projectDependencyMediaKeys(dependencies);
  const assetKeys = projectAssetMediaKeys(root['assets']);
  if (!dependencyKeys || !assetKeys) return [UNKNOWN_READY_MEDIA];
  const keys = new Set([...dependencyKeys, ...assetKeys]);
  addEmbeddedProjectMediaKeys(keys, project);
  return [...keys];
}

function addEmbeddedProjectMediaKeys(
  keys: Set<string>,
  project: NonNullable<ReturnType<typeof parseVideoProjectMetadataEntry>>
): void {
  for (const asset of project.project.assets) {
    if (asset.source.kind === 'library-asset') keys.add(reference('media', asset.source.mediaId));
    if (asset.source.kind === 'project-asset') {
      if (asset.source.originMediaId !== undefined)
        keys.add(reference('media', asset.source.originMediaId));
      keys.add(reference('media', `project-asset:${asset.source.projectAssetId}`));
    }
  }
}
