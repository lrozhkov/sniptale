import { parseProjectAssetEntry } from '../projects/read-guards';
import { MediaAssetDeletionBlockedError } from './deletion-errors';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { MediaLibraryEntry } from './contracts';
import type { ScenarioAssetEntry } from '../scenario/contracts';
import type {
  VideoProject,
  VideoProjectAssetSource,
  VideoProjectSource,
} from '../../../features/video/project/types';
import type { VideoWorkspace } from '../review-workspaces/contracts';
import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';

/** Root identity used by every project projection, independent of presentation metadata. */
export type MediaDependencyTarget = Pick<MediaLibraryEntry, 'id' | 'source'> & {
  privateProjectAssetIds?: ReadonlySet<string>;
};

/** Compare source locators independently of serialized property order. */
export function sameMediaSource(
  a: MediaLibraryEntry['source'],
  b: MediaLibraryEntry['source']
): boolean {
  switch (a.kind) {
    case 'screenshot':
      return b.kind === a.kind;
    case 'stored-asset':
      return b.kind === a.kind && a.assetId === b.assetId;
    case 'recording':
      return b.kind === a.kind && a.recordingId === b.recordingId;
    case 'project-asset':
      return b.kind === a.kind && a.projectAssetId === b.projectAssetId;
    case 'project-export':
      return b.kind === a.kind && a.exportId === b.exportId && a.projectId === b.projectId;
    case 'web-snapshot':
      return b.kind === a.kind && a.snapshotId === b.snapshotId;
  }
}

type ScenarioMediaLocator = Pick<
  ScenarioAssetEntry,
  'id' | 'assetId' | 'galleryAssetId' | 'borrowedMediaId'
>;

/** Library insertion membership is distinct from immutable byte ownership. */
export function scenarioChildUsesMedia(
  child: ScenarioMediaLocator,
  media: MediaDependencyTarget
): boolean {
  return (
    child.galleryAssetId === media.id ||
    child.borrowedMediaId === media.id ||
    (media.source.kind === 'stored-asset' &&
      !child.borrowedMediaId &&
      media.id.startsWith('scenario-asset:') &&
      child.id === media.id.slice('scenario-asset:'.length))
  );
}

/** Primary recordings are required by project identity, independent of clip presence. */
export function isVideoPrimaryMediaSource(
  project: Pick<VideoProject, 'baseRecordingId' | 'source'>,
  media: MediaDependencyTarget
): boolean {
  return (
    media.source.kind === 'recording' &&
    (project.baseRecordingId === media.source.recordingId ||
      (project.source.kind === 'recording' &&
        project.source.recordingId === media.source.recordingId))
  );
}

/** Include private acquisition rows so identity is durable before a placement save. */
export function mediaDependencyTarget(
  media: Pick<MediaLibraryEntry, 'id' | 'source'>,
  rawAssets: readonly unknown[]
): MediaDependencyTarget {
  const privateProjectAssetIds = new Set<string>();
  for (const raw of rawAssets) {
    if (!isRecord(raw)) throw new MediaAssetDeletionBlockedError('invalid-graph');
    const origin = raw['originMediaId'];
    if (origin === undefined) continue;
    if (typeof origin !== 'string' || !origin)
      throw new MediaAssetDeletionBlockedError('invalid-graph');
    if (origin !== media.id) continue;
    const entry = parseProjectAssetEntry(raw);
    if (!entry) throw new MediaAssetDeletionBlockedError('source-unavailable');
    privateProjectAssetIds.add(entry.id);
  }
  return { ...media, privateProjectAssetIds };
}

export function reviewReferencesForMedia(media: MediaDependencyTarget): ReadonlySet<string> {
  return new Set([
    ...(media.source.kind === 'project-asset'
      ? [`project-asset:${media.source.projectAssetId}`]
      : []),
    ...[...(media.privateProjectAssetIds ?? [])].map((id) => `project-asset:${id}`),
  ]);
}

/** Auxiliary quick-edit refs include saved history/recovery, excluding the root's own sidecar. */
export function reviewWorkspaceUsesMedia(
  workspace: VideoWorkspace,
  media: MediaDependencyTarget
): boolean {
  if (workspace.aggregateId === media.id) return false;
  const refs = collectReviewAssetReferences(workspace);
  return [...reviewReferencesForMedia(media)].some((ref) => refs.has(ref));
}

interface VideoSourceReference {
  kind: VideoProjectAssetSource['kind'];
  id: string;
}

/** Enumerate insertion identities once for warning, mutation and retention projections. */
export function videoSourceReferences(source: VideoProjectAssetSource): VideoSourceReference[] {
  switch (source.kind) {
    case 'library-asset':
      return [{ kind: source.kind, id: source.mediaId }];
    case 'recording':
      return [{ kind: source.kind, id: source.recordingId }];
    case 'scenario-asset':
      return [{ kind: source.kind, id: source.scenarioAssetId }];
    case 'project-asset':
      return [
        { kind: source.kind, id: source.projectAssetId },
        ...(source.originMediaId
          ? [{ kind: 'library-asset' as const, id: source.originMediaId }]
          : []),
        ...(source.originRecordingId
          ? [{ kind: 'recording' as const, id: source.originRecordingId }]
          : []),
      ];
  }
}

/** Match insertion identities without using filenames or shared bytes as identity. */
export function videoSourceUsesMedia(
  source: VideoProjectAssetSource,
  media: MediaDependencyTarget,
  scenarioChildIds: ReadonlySet<string>
): boolean {
  return videoSourceReferences(source).some(
    (ref) =>
      (ref.kind === 'library-asset' && ref.id === media.id) ||
      (ref.kind === 'recording' &&
        media.source.kind === 'recording' &&
        ref.id === media.source.recordingId) ||
      (ref.kind === 'project-asset' &&
        ((media.source.kind === 'project-asset' && ref.id === media.source.projectAssetId) ||
          media.privateProjectAssetIds?.has(ref.id))) ||
      (ref.kind === 'scenario-asset' && scenarioChildIds.has(ref.id))
  );
}

/** Prove disjointness from every scenario source locator before bypassing full content admission. */
export function scenarioChildIsUnrelated(value: unknown, media: MediaDependencyTarget): boolean {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    typeof value['assetId'] !== 'string' ||
    (value['galleryAssetId'] !== null && typeof value['galleryAssetId'] !== 'string') ||
    (value['borrowedMediaId'] !== undefined && typeof value['borrowedMediaId'] !== 'string')
  )
    return false;
  return !scenarioChildUsesMedia(
    {
      id: value['id'],
      assetId: value['assetId'],
      galleryAssetId: value['galleryAssetId'],
      ...(typeof value['borrowedMediaId'] === 'string'
        ? { borrowedMediaId: value['borrowedMediaId'] }
        : {}),
    },
    media
  );
}

function parseVideoDependencySource(value: unknown): VideoProjectAssetSource | null {
  if (!isRecord(value)) return null;
  if (value['kind'] === 'library-asset' && typeof value['mediaId'] === 'string' && value['mediaId'])
    return { kind: 'library-asset', mediaId: value['mediaId'] };
  if (
    value['kind'] === 'recording' &&
    typeof value['recordingId'] === 'string' &&
    value['recordingId']
  )
    return { kind: 'recording', recordingId: value['recordingId'] };
  if (
    value['kind'] === 'project-asset' &&
    typeof value['projectAssetId'] === 'string' &&
    value['projectAssetId']
  ) {
    if (
      (value['originMediaId'] !== undefined &&
        (typeof value['originMediaId'] !== 'string' || !value['originMediaId'])) ||
      (value['originRecordingId'] !== undefined &&
        (typeof value['originRecordingId'] !== 'string' || !value['originRecordingId']))
    )
      return null;
    return {
      kind: 'project-asset',
      projectAssetId: value['projectAssetId'],
      ...(typeof value['originMediaId'] === 'string'
        ? { originMediaId: value['originMediaId'] }
        : {}),
      ...(typeof value['originRecordingId'] === 'string'
        ? { originRecordingId: value['originRecordingId'] }
        : {}),
    };
  }
  if (
    value['kind'] === 'scenario-asset' &&
    typeof value['scenarioAssetId'] === 'string' &&
    value['scenarioAssetId']
  )
    return { kind: 'scenario-asset', scenarioAssetId: value['scenarioAssetId'] };
  return null;
}

function parseVideoDependencyOrigin(value: unknown): VideoProjectSource | null {
  if (!isRecord(value)) return null;
  if (value['kind'] === 'manual') return { kind: 'manual' };
  if (
    value['kind'] === 'recording' &&
    typeof value['recordingId'] === 'string' &&
    value['recordingId']
  )
    return { kind: 'recording', recordingId: value['recordingId'] };
  if (
    value['kind'] === 'scenario' &&
    typeof value['scenarioProjectId'] === 'string' &&
    value['scenarioProjectId']
  )
    return { kind: 'scenario', scenarioProjectId: value['scenarioProjectId'] };
  return null;
}

interface VideoDependencyEnvelope {
  source: VideoProjectSource;
  baseRecordingId: string | null;
  sources: VideoProjectAssetSource[];
}

/** Admit every reference-bearing field independently of render metadata. */
export function parseVideoDependencyEnvelope(value: unknown): VideoDependencyEnvelope | null {
  if (!isRecord(value) || !isRecord(value['project'])) return null;
  const project = value['project'];
  if (
    project['version'] !== 2 ||
    Object.hasOwn(project, 'templateInstances') ||
    !Array.isArray(project['assets']) ||
    !(project['baseRecordingId'] === null || typeof project['baseRecordingId'] === 'string')
  )
    return null;
  const source = parseVideoDependencyOrigin(project['source']);
  if (!source) return null;
  const sources: VideoProjectAssetSource[] = [];
  for (const asset of project['assets']) {
    if (!isRecord(asset)) return null;
    const locator = parseVideoDependencySource(asset['source']);
    if (!locator) return null;
    sources.push(locator);
  }
  return { source, baseRecordingId: project['baseRecordingId'], sources };
}

/** Prove disjoint video source envelopes without depending on unrelated render metadata. */
export function videoEntryIsUnrelated(
  value: unknown,
  media: MediaDependencyTarget,
  scenarioChildIds: ReadonlySet<string>
): boolean {
  const envelope = parseVideoDependencyEnvelope(value);
  return (
    envelope !== null &&
    !isVideoPrimaryMediaSource(envelope, media) &&
    !envelope.sources.some((source) => videoSourceUsesMedia(source, media, scenarioChildIds))
  );
}
