import {
  preparePortableScenarioRoot,
  assertScenarioCausalDependencies,
  scenarioDependencyReferenceMaps,
} from './prepared-scenario';
import { captureProfileBounds } from '../../composition/persistence/sync-capture/contracts';
import {
  parseSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../../composition/persistence/remote-connection/model';
import { preparePortableImageRows, validatePortableImageRows } from './prepared-image';
import {
  preparePortableVideoReviewRoot,
  validatePortableVideoReviewMetadata,
} from './prepared-review';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { ArchiveReader } from '../../composition/archive-transfer';
import { parseAssetRef, type AssetRef } from '../../composition/persistence/assets';
import { parseMediaLibraryEntry } from '../../composition/persistence/media-library/read-guards';
import { parseStoredWebSnapshotRecord } from '../../composition/persistence/web-snapshots/guards';
import {
  parseProjectExportEntry,
  parseVideoProjectMetadataEntry,
} from '../../composition/persistence/projects/read-guards';
import { collectReviewAssetReferences } from '../../composition/persistence/review-workspaces/asset-refs';
import { prepareVideoReviewRestore } from '../../composition/persistence/review-workspaces/backup-restore';
import {
  type PreparedProjectReplicaExport,
  parsePreparedVideoProjectReplicaRoot,
} from '../../composition/persistence/sync-capture/prepared-project';
import type { ApplyPreparedVideoProjectRevisionInput } from '../../composition/persistence/sync-capture/apply-video-project';
import {
  MAX_CAPTURE_ROWS,
  type CapturedMediaDependency,
  type CausalRootDependency,
} from '../../composition/persistence/sync-capture/contracts';
import {
  isSupportedCaptureProject,
  parseCapturedMediaRows,
} from '../../composition/persistence/sync-capture/guards';
import type { PreparedReplicaPayload } from '../../composition/persistence/sync-capture/replica-publication';
import { collectCapturedProjectRecordingIds } from '../../composition/persistence/sync-capture/project-snapshot';
import { transformPortableVideoProjectReferences } from '../media-hub-backup/v6/root-publication/video-project-references';
import { verifyPreparedMediaReviewAnnotations } from '../media-hub-backup/v6/root-publication/media-review-assets';
import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import {
  parsePortableMediaMetadata,
  preparePortableMediaOriginal,
} from '../media-hub-backup/v6/root-codecs/media';
import { assertArchiveRootObjectInventory } from '../media-hub-backup/v6/root-codecs/object-inventory';
import {
  decodePortableVideoProjectAssetRefs,
  parsePortableVideoProjectMetadata,
  parsePortableScenarioProjectMetadata,
  preparePortableVideoProjectAsset,
} from '../media-hub-backup/v6/root-codecs/projects';

const metadataOnlyReader: ArchiveReader = {
  entries: () => [],
  entry: () => null,
  close: async () => undefined,
};

function exactKeys(value: object, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error('Unsupported portable sync metadata.');
}

/** Parses the supported pilot and its complete typed object table without reading object bytes. */
export async function parsePortableSyncRoot(value: unknown, reviewSourceMediaId?: string) {
  const envelope = structuredClone(parseRootEnvelope(value));
  if (
    new TextEncoder().encode(JSON.stringify(envelope.metadata)).byteLength >
    captureProfileBounds(envelope.descriptor.rootKind).metadataBytes
  )
    throw new Error('Portable sync metadata exceeds the pilot limit.');
  if (
    envelope.descriptor.rootKind === 'media' &&
    envelope.descriptor.mediaSubtype === 'library-item'
  ) {
    const metadata = parsePortableMediaMetadata(envelope.metadata);
    if (reviewSourceMediaId !== undefined) {
      const raw = envelope.metadata;
      if (!isRecord(raw)) throw new Error('Invalid portable video review metadata.');
      exactKeys(raw, [
        'entry',
        'projectAsset',
        'projectExport',
        'recording',
        'originalObjectId',
        'videoReview',
        'reviewAssets',
        'thumbnail',
      ]);
      if (Array.isArray(raw['reviewAssets']))
        for (const asset of raw['reviewAssets']) {
          if (!isRecord(asset)) throw new Error('Invalid portable video review resource.');
          exactKeys(asset, [
            'entry',
            'filename',
            'objectId',
            'publishToLibrary',
            'libraryMediaId',
            'videoReview',
          ]);
        }
      if (metadata.entry.id !== envelope.descriptor.rootId)
        throw new Error('Portable video review identity differs from its root.');
      validatePortableVideoReviewMetadata(metadata, reviewSourceMediaId);
      await assertArchiveRootObjectInventory(envelope, metadataOnlyReader, []);
      if (
        metadata.thumbnail &&
        !envelope.objects
          .find((object) => object.objectId === metadata.thumbnail?.objectId)
          ?.mimeType.startsWith('image/')
      )
        throw new Error('Portable video review thumbnail requires image bytes.');
      return {
        kind: 'video-review' as const,
        envelope,
        metadata,
        sourceMediaId: reviewSourceMediaId,
      };
    }
    if (
      metadata.entry.source.kind === 'screenshot' ||
      (metadata.entry.source.kind === 'stored-asset' &&
        (metadata.entry.kind === 'image' || metadata.entry.kind === 'screenshot'))
    ) {
      exactKeys(metadata, ['entry', 'originalObjectId', 'workspace', 'presentation']);
      if (metadata.entry.id !== envelope.descriptor.rootId)
        throw new Error('Portable image identity differs from its root.');
      await assertArchiveRootObjectInventory(envelope, metadataOnlyReader, []);
      validatePortableImageRows(envelope, metadata);
      return { kind: 'image' as const, envelope, metadata };
    }
    exactKeys(metadata, [
      'entry',
      'projectAsset',
      'projectExport',
      'recording',
      'webSnapshot',
      'originalObjectId',
    ]);
    if (
      metadata.entry.id !== envelope.descriptor.rootId ||
      (!metadata.projectAsset &&
        !metadata.recording &&
        !metadata.projectExport &&
        !metadata.webSnapshot &&
        metadata.entry.source.kind !== 'stored-asset')
    )
      throw new Error('Unsupported portable media root.');
    await assertArchiveRootObjectInventory(envelope, metadataOnlyReader, []);
    return { kind: 'media' as const, envelope, metadata };
  }
  if (envelope.descriptor.rootKind === 'scenario-project') {
    if (reviewSourceMediaId !== undefined)
      throw new Error('Scenario cannot carry an independent video review.');
    const metadata = parsePortableScenarioProjectMetadata(envelope.metadata);
    if (
      metadata.entry.id !== envelope.descriptor.rootId ||
      metadata.assets.length > captureProfileBounds('scenario-project').rows ||
      metadata.stepDocuments.length > captureProfileBounds('scenario-project').rows ||
      envelope.objects.length > captureProfileBounds('scenario-project').objects
    )
      throw new Error('Portable Scenario inventory is invalid.');
    await assertArchiveRootObjectInventory(envelope, null, []);
    const project = metadata.entry.project;
    if (!isRecord(project) || typeof project['name'] !== 'string')
      throw new Error('Invalid Scenario project name.');
    return { kind: 'scenario-project' as const, envelope, metadata, name: project['name'] };
  }
  if (reviewSourceMediaId !== undefined)
    throw new Error('A portable source binding requires a video review carrier.');
  if (envelope.descriptor.rootKind !== 'video-project')
    throw new Error('Unsupported portable sync root.');
  const metadata = parsePortableVideoProjectMetadata(envelope.metadata);
  exactKeys(metadata, ['entry', 'projectAssets', 'projectExports', 'thumbnail', 'presentation']);
  if (
    metadata.projectAssets.length > MAX_CAPTURE_ROWS ||
    metadata.projectExports.length > MAX_CAPTURE_ROWS
  )
    throw new Error('Portable project inventory exceeds the pilot limit.');
  for (const asset of metadata.projectAssets) {
    exactKeys(asset, [
      'entry',
      'filename',
      'objectId',
      'publishToLibrary',
      'libraryMediaId',
      'videoReview',
    ]);
    if (asset.libraryMediaId && asset.videoReview)
      throw new Error('A borrowed portable source cannot replace its independent review.');
  }
  for (const item of metadata.projectExports) {
    exactKeys(item, ['entry', 'objectId', 'libraryMediaId', 'thumbnail', 'videoReview']);
    if (
      !parseProjectExportEntry({ ...item.entry, assetId: 'portable' }) ||
      item.entry.projectId !== metadata.entry.id
    )
      throw new Error('Unsupported portable export metadata.');
  }
  for (const snapshot of metadata.entry.project.effectSnapshots ?? []) {
    exactKeys(snapshot, [
      'id',
      'documentId',
      'kind',
      'retainedByteLength',
      'schemaVersion',
      'sha256',
      'source',
      'assets',
    ]);
    for (const asset of snapshot.assets)
      exactKeys(asset, ['id', 'byteLength', 'kind', 'mimeType', 'sha256', 'objectId']);
  }
  const entry = parseVideoProjectMetadataEntry({
    ...metadata.entry,
    project: decodePortableVideoProjectAssetRefs({
      ...metadata.entry.project,
      ...(metadata.entry.project.effectSnapshots === undefined
        ? {}
        : {
            effectSnapshots: metadata.entry.project.effectSnapshots.map((snapshot) => ({
              ...snapshot,
              assets: snapshot.assets.map(({ objectId: _objectId, ...asset }) => asset),
            })),
          }),
    }),
  });
  if (
    !entry ||
    entry.id !== envelope.descriptor.rootId ||
    !isSupportedCaptureProject(entry.project)
  )
    throw new Error('Unsupported portable project root.');
  await assertArchiveRootObjectInventory(envelope, metadataOnlyReader, []);
  return { kind: 'video-project' as const, envelope, metadata, entry };
}

/** Local admission values come from the target owner, never from a sender's generation counters. */
export interface PortableReplicaAdmission {
  authorization?: SyncConnectionIdentity;
  operationId: string;
  sourceDigest: string;
  connectionGeneration: number;
  spaceId: string;
  profileCreatedAt: number;
  expectedBasis: readonly string[];
  expectedLocalGeneration: number;
  expectedWorkspaceRevision: number | null;
  dependencies: ApplyPreparedVideoProjectRevisionInput['dependencies'];
  rootDependencies?: ApplyPreparedVideoProjectRevisionInput['rootDependencies'];
}

type ParsedPortableRoot = Awaited<ReturnType<typeof parsePortableSyncRoot>>;
// Native capture counters are optional legacy hints. Admission uses causal basis only.
type PortableCausalDependency = Omit<CapturedMediaDependency, 'generation'> & {
  generation?: number;
};
type VerifiedObjectResolver = (id: string) => AssetRef;

function editingProjectAssets(
  parsed: Extract<ParsedPortableRoot, { kind: 'video-project' }>,
  retainedExportIds: ReadonlySet<string> = new Set()
) {
  const declared = new Map(parsed.metadata.projectAssets.map((asset) => [asset.entry.id, asset]));
  const needed = new Set(
    parsed.entry.project.assets.flatMap((asset) =>
      asset.source.kind === 'project-asset' ? [asset.source.projectAssetId] : []
    )
  );
  for (const item of parsed.metadata.projectExports) {
    if (retainedExportIds.has(item.entry.id)) continue;
    if (item.videoReview)
      for (const reference of collectReviewAssetReferences(item.videoReview.workspace)) {
        if (!reference.startsWith('project-asset:'))
          throw new Error('Unsupported portable export review source.');
        needed.add(reference.slice('project-asset:'.length));
      }
  }
  for (const id of needed) {
    const asset = declared.get(id);
    if (!asset) throw new Error('Portable editing source is missing.');
    if (asset.videoReview) {
      for (const reference of collectReviewAssetReferences(asset.videoReview.workspace)) {
        if (!reference.startsWith('project-asset:'))
          throw new Error('Unsupported portable editing review source.');
        needed.add(reference.slice('project-asset:'.length));
      }
    }
  }
  return parsed.metadata.projectAssets.filter((asset) => needed.has(asset.entry.id));
}

/** Editing closure includes retained private reviews and inline bytes, excluding saved exports. */
export function portableSyncEditingObjectIds(
  parsed: ParsedPortableRoot,
  retainedExportIds?: ReadonlySet<string>
): string[] {
  const retained =
    retainedExportIds ??
    new Set(
      parsed.kind === 'video-project'
        ? parsed.metadata.projectExports.map((item) => item.entry.id)
        : []
    );
  if (parsed.kind === 'scenario-project')
    return parsed.envelope.objects.map((object) => object.objectId);
  if (parsed.kind === 'image') return parsed.envelope.objects.map((object) => object.objectId);
  if (parsed.kind === 'media')
    return [
      parsed.metadata.originalObjectId,
      ...(parsed.metadata.webSnapshot ? [parsed.metadata.webSnapshot.screenshotObjectId] : []),
    ];
  if (parsed.kind === 'video-review')
    return [
      parsed.metadata.originalObjectId,
      ...(parsed.metadata.reviewAssets ?? []).map((asset) => asset.objectId),
      ...(parsed.metadata.thumbnail ? [parsed.metadata.thumbnail.objectId] : []),
    ];
  return [
    ...new Set([
      ...editingProjectAssets(parsed, retained).map((asset) => asset.objectId),
      ...parsed.metadata.projectExports.flatMap((item) =>
        !retained.has(item.entry.id) && item.thumbnail ? [item.thumbnail.objectId] : []
      ),
      ...(parsed.metadata.entry.project.effectSnapshots ?? []).flatMap((snapshot) =>
        snapshot.assets.map((asset) => asset.objectId)
      ),
      ...(parsed.metadata.thumbnail ? [parsed.metadata.thumbnail.objectId] : []),
      ...(parsed.metadata.presentation
        ? [
            parsed.metadata.presentation.thumbnailObjectId,
            ...(parsed.metadata.presentation.previewObjectId
              ? [parsed.metadata.presentation.previewObjectId]
              : []),
          ]
        : []),
    ]),
  ];
}

function prepareMediaRows(
  parsed: Extract<ParsedPortableRoot, { kind: 'media' }>,
  refFor: VerifiedObjectResolver
) {
  const ref = refFor(parsed.metadata.originalObjectId);
  const media = parseMediaLibraryEntry({
    ...parsed.metadata.entry,
    ...(parsed.metadata.entry.source.kind === 'stored-asset'
      ? { source: { kind: 'stored-asset', assetId: ref.assetId } }
      : {}),
  });
  if (!media) throw new Error('Invalid portable media entry.');
  if (media.source.kind === 'stored-asset') {
    const rows = parseCapturedMediaRows({ media, ref });
    if (!rows) throw new Error('Unsupported portable stored original.');
    return rows;
  }
  if (parsed.metadata.projectExport) {
    const projectExport = parseProjectExportEntry({
      ...parsed.metadata.projectExport,
      assetId: ref.assetId,
    });
    const rows = parseCapturedMediaRows({ media, projectExport, ref });
    if (!rows) throw new Error('Unsupported portable export original.');
    return rows;
  }
  if (parsed.metadata.webSnapshot) {
    const snapshot = parsed.metadata.webSnapshot;
    const screenshotRef = refFor(snapshot.screenshotObjectId);
    const webSnapshot = parseStoredWebSnapshotRecord({
      ...snapshot.entry,
      packageAssetId: ref.assetId,
      screenshotAssetId: screenshotRef.assetId,
    });
    const rows = parseCapturedMediaRows({ media, webSnapshot, ref, screenshotRef });
    if (!rows || snapshot.packageObjectId !== parsed.metadata.originalObjectId)
      throw new Error('Unsupported portable web snapshot.');
    return rows;
  }
  if (parsed.metadata.recording) {
    const rows = parseCapturedMediaRows({
      media,
      ref,
      recording: { ...parsed.metadata.recording.entry, assetId: ref.assetId },
      telemetry: parsed.metadata.recording.telemetry ?? null,
    });
    if (!rows) throw new Error('Unsupported portable recording original.');
    return rows;
  }
  const projectAsset = preparePortableMediaOriginal({
    metadata: parsed.metadata,
    media,
    originalRef: ref,
  });
  const rows = parseCapturedMediaRows({ media, projectAsset, ref });
  if (!rows) throw new Error('Unsupported portable media original.');
  return rows;
}

function assertCausalDependencies(
  needed: ReadonlySet<string>,
  dependencies: PortableReplicaAdmission['dependencies'],
  sender: readonly PortableCausalDependency[]
): void {
  if (
    needed.size !== dependencies.length ||
    needed.size !== sender.length ||
    new Set(dependencies.map((item) => item.entry.id)).size !== needed.size ||
    new Set(sender.map((item) => item.mediaId)).size !== needed.size
  )
    throw new Error('Portable dependency inventory differs from local admission.');
  for (const dependency of dependencies) {
    const causal = sender.find((item) => item.mediaId === dependency.entry.id);
    const entry = parseMediaLibraryEntry(dependency.entry);
    const ref = parseAssetRef(dependency.ref);
    if (
      !needed.has(dependency.entry.id) ||
      !entry ||
      entry.blob ||
      !ref ||
      entry.size !== ref.size ||
      entry.mimeType !== ref.mimeType ||
      !Number.isSafeInteger(dependency.expectedGeneration) ||
      dependency.expectedGeneration < 1 ||
      !causal ||
      causal.basis.length !== 1 ||
      dependency.expectedBasis.length !== 1 ||
      !causal.basis[0] ||
      causal.basis[0] !== dependency.expectedBasis[0]
    )
      throw new Error('Portable causal dependency differs from admitted target state.');
  }
}

/** Shared exact dependency inventory for wire admission and native portable preparation. */
export function portableSyncDependencyIds(
  parsed: ParsedPortableRoot,
  declaredDependencyIds?: readonly string[]
): string[] {
  if (parsed.kind === 'media' || parsed.kind === 'image') return [];
  if (parsed.kind === 'scenario-project') {
    const required = new Set(
      parsed.metadata.assets.flatMap((asset) =>
        asset.entry.borrowedMediaId
          ? [asset.entry.borrowedMediaId]
          : asset.entry.galleryAssetId
            ? [asset.entry.galleryAssetId]
            : []
      )
    );
    const optional = new Set(
      parsed.metadata.assets
        .filter((asset) => !asset.entry.borrowedMediaId && !asset.entry.galleryAssetId)
        .map((asset) => `scenario-asset:${asset.entry.id}`)
    );
    if (declaredDependencyIds)
      for (const id of declaredDependencyIds) {
        if (!required.has(id) && !optional.has(id))
          throw new Error('Scenario dependency does not name an admitted child mirror.');
        required.add(id);
      }
    return [...required].sort();
  }
  const needed = new Set<string>();
  if (parsed.kind === 'video-review') {
    needed.add(parsed.sourceMediaId);
    for (const asset of parsed.metadata.reviewAssets ?? []) {
      if (asset.libraryMediaId) needed.add(asset.libraryMediaId);
      if (asset.entry.originMediaId) needed.add(asset.entry.originMediaId);
    }
    return [...needed].sort();
  }
  for (const id of collectCapturedProjectRecordingIds(parsed.entry.project))
    needed.add(`recording:${id}`);
  for (const asset of parsed.entry.project.assets) {
    if (asset.source.kind === 'library-asset') needed.add(asset.source.mediaId);
    if (asset.source.kind === 'project-asset' && asset.source.originMediaId)
      needed.add(asset.source.originMediaId);
  }
  for (const asset of editingProjectAssets(
    parsed,
    new Set(parsed.metadata.projectExports.map((item) => item.entry.id))
  )) {
    if (asset.entry.originMediaId) needed.add(asset.entry.originMediaId);
    if (asset.libraryMediaId) needed.add(asset.libraryMediaId);
  }
  return [...needed].sort();
}

/** Native saved-export identity and the selected immutable remote body. */
export interface DeferredProjectExport {
  ref: AssetRef;
  remote: PreparedProjectReplicaExport['remote'];
  retainedEntry?: PreparedProjectReplicaExport['entry'];
}

async function prepareVideoRoot(
  parsed: Extract<ParsedPortableRoot, { kind: 'video-project' }>,
  local: PortableReplicaAdmission,
  sender: readonly PortableCausalDependency[],
  refFor: VerifiedObjectResolver,
  deferredExports?: ReadonlyMap<string, DeferredProjectExport>
): Promise<ApplyPreparedVideoProjectRevisionInput['root']> {
  const needed = new Set(portableSyncDependencyIds(parsed));
  // Later staging must not replace a predecessor child that another native root can retain.
  // The existing prepared journal persists these local private identities through recovery.
  const retainedExportIds = new Set(
    deferredExports === undefined
      ? parsed.metadata.projectExports.map((item) => item.entry.id)
      : [...deferredExports].flatMap(([id, item]) => (item.retainedEntry ? [id] : []))
  );
  const causalAssets = new Set(
    editingProjectAssets(
      parsed,
      new Set(parsed.metadata.projectExports.map((item) => item.entry.id))
    ).map((asset) => asset.entry.id)
  );
  const editingAssets = editingProjectAssets(parsed, retainedExportIds);
  const borrowed = (asset: (typeof editingAssets)[number]) =>
    causalAssets.has(asset.entry.id) && asset.libraryMediaId !== undefined;
  const assetIds = new Map(
    editingAssets.map((asset) => [
      asset.entry.id,
      (!borrowed(asset) && local.expectedLocalGeneration > 0) ||
      (!causalAssets.has(asset.entry.id) && asset.libraryMediaId !== undefined)
        ? crypto.randomUUID()
        : asset.entry.id,
    ])
  );
  const assets = editingAssets.map((asset) => {
    const ref = refFor(asset.objectId);
    const entry = preparePortableVideoProjectAsset({
      entry: asset.entry,
      id: assetIds.get(asset.entry.id),
      originalRef: ref,
    });
    if (borrowed(asset)) {
      const dependency = local.dependencies.find((item) => item.entry.id === asset.libraryMediaId);
      if (
        !dependency ||
        dependency.entry.source.kind !== 'project-asset' ||
        dependency.entry.source.projectAssetId !== entry.id ||
        JSON.stringify(parseAssetRef(dependency.ref)) !== JSON.stringify(ref)
      )
        throw new Error('Borrowed portable source differs from admitted target bytes.');
    } else if (causalAssets.has(asset.entry.id) && asset.publishToLibrary !== false)
      throw new Error('Portable private source must remain private.');
    return {
      entry,
      ref,
      filename: asset.filename,
      ...(borrowed(asset) ? { reusePublished: true } : { publishToLibrary: false }),
      ...(asset.videoReview
        ? {
            videoReview: prepareVideoReviewRestore({
              review: asset.videoReview,
              sourceAggregateId: `project-asset:${asset.entry.id}`,
              targetAggregateId: `project-asset:${entry.id}`,
              sourceAssetId: ref.assetId,
              assetIdMap: assetIds,
            }),
          }
        : {}),
    };
  });
  for (const asset of assets)
    if (asset.videoReview) await verifyPreparedMediaReviewAnnotations(asset.videoReview, assets);
  assertCausalDependencies(needed, local.dependencies, sender);
  for (const asset of parsed.entry.project.assets) {
    const source = asset.source;
    const resource =
      source.kind === 'library-asset'
        ? local.dependencies.find((item) => item.entry.id === source.mediaId)?.entry
        : source.kind === 'project-asset'
          ? assets.find((item) => item.entry.id === assetIds.get(source.projectAssetId))?.entry
          : source.kind === 'recording'
            ? local.dependencies.find((item) => item.entry.id === `recording:${source.recordingId}`)
                ?.entry
            : source.kind === 'scenario-asset'
              ? local.rootDependencies
                  ?.flatMap((item) => item.children)
                  .find((child) => child.entry.id === source.scenarioAssetId)?.entry
              : undefined;
    if (
      !resource ||
      resource.mimeType !== asset.metadata.mimeType ||
      resource.size !== asset.metadata.size
    )
      throw new Error('Portable project source metadata differs from admitted resource.');
  }
  const scenarioMaps = scenarioDependencyReferenceMaps(local.rootDependencies ?? []);
  const mediaRootIds = new Map<string, string>(
    local.dependencies.map((item) => [`media:library-item:${item.entry.id}`, item.entry.id])
  );
  const project = transformPortableVideoProjectReferences(
    parsed.entry.project,
    assetIds,
    { ...Object.fromEntries(mediaRootIds), ...scenarioMaps.rootIdMap },
    scenarioMaps.childIdMap
  );
  const snapshotRefs = (parsed.metadata.entry.project.effectSnapshots ?? []).flatMap((snapshot) =>
    snapshot.assets.map((asset) => ({
      snapshotId: snapshot.id,
      assetId: asset.id,
      ref: refFor(asset.objectId),
    }))
  );
  const exports =
    deferredExports === undefined
      ? undefined
      : parsed.metadata.projectExports.map((item) => {
          const deferred = deferredExports.get(item.entry.id);
          if (!deferred) throw new Error('Retained export binding is missing.');
          const entry =
            deferred.retainedEntry ??
            parseProjectExportEntry({ ...item.entry, assetId: deferred.ref.assetId });
          if (!entry) throw new Error('Retained export metadata is invalid.');
          const videoReview =
            !deferred.retainedEntry && item.videoReview
              ? prepareVideoReviewRestore({
                  review: item.videoReview,
                  sourceAggregateId: `export:${item.entry.id}`,
                  targetAggregateId: `export:${entry.id}`,
                  sourceAssetId: deferred.ref.assetId,
                  assetIdMap: assetIds,
                })
              : undefined;
          return {
            entry,
            ref: deferred.ref,
            remote: deferred.remote,
            ...(deferred.retainedEntry ? { reuseExisting: true } : {}),
            ...(videoReview ? { videoReview } : {}),
            ...(!deferred.retainedEntry && item.thumbnail
              ? {
                  thumbnail: {
                    entry: {
                      assetId: `export:${entry.id}`,
                      createdAt: item.thumbnail.createdAt,
                      updatedAt: item.thumbnail.updatedAt,
                      width: item.thumbnail.width,
                      height: item.thumbnail.height,
                    },
                    ref: refFor(item.thumbnail.objectId),
                  },
                }
              : {}),
          };
        });
  for (const item of exports ?? [])
    if (item.videoReview) await verifyPreparedMediaReviewAnnotations(item.videoReview, assets);
  const thumbnail = parsed.metadata.thumbnail;
  const presentation = parsed.metadata.presentation;
  return parsePreparedVideoProjectReplicaRoot({
    entry: { ...parsed.entry, project },
    assets,
    ...(exports === undefined ? {} : { exports }),
    ...(snapshotRefs.length ? { snapshotRefs } : {}),
    ...(thumbnail
      ? {
          thumbnail: {
            entry: {
              assetId: `video-project:${parsed.entry.id}`,
              createdAt: thumbnail.createdAt,
              updatedAt: thumbnail.updatedAt,
              width: thumbnail.width,
              height: thumbnail.height,
            },
            ref: refFor(thumbnail.objectId),
          },
        }
      : {}),
    ...(presentation
      ? {
          presentation: {
            entry: presentation.entry,
            thumbnailRef: refFor(presentation.thumbnailObjectId),
            ...(presentation.previewObjectId
              ? { previewRef: refFor(presentation.previewObjectId) }
              : {}),
          },
        }
      : {}),
  });
}

/**
 * Caller verifies actual object size/SHA and sourceDigest before this call.
 * Caller retains continuous staging protection through native journal admission.
 * Verified refs cover editing objects only. Saved export bytes are not needed to open a project.
 * Borrowed objects must map to independently admitted target refs with the same verified bytes.
 */
export async function preparePortableReplica(args: {
  envelope: unknown;
  reviewSourceMediaId?: string;
  verifiedObjects: ReadonlyMap<string, AssetRef>;
  deferredExports?: ReadonlyMap<string, DeferredProjectExport>;
  senderDependencies: readonly PortableCausalDependency[];
  senderRootDependencies?: readonly CausalRootDependency[];
  admission: PortableReplicaAdmission;
  stageNativeMetadata?: (blob: Blob) => Promise<AssetRef>;
}): Promise<PreparedReplicaPayload> {
  // Detach all caller metadata before inventory validation yields.
  const objects = structuredClone(args.verifiedObjects);
  const sender = structuredClone(args.senderDependencies);
  const local = structuredClone(args.admission);
  const parsed = await parsePortableSyncRoot(args.envelope, args.reviewSourceMediaId);
  assertScenarioCausalDependencies(
    parsed,
    local,
    structuredClone(args.senderRootDependencies ?? [])
  );
  if (
    sender.length > captureProfileBounds(parsed.kind).rows ||
    local.dependencies.length > captureProfileBounds(parsed.kind).rows
  )
    throw new Error('Portable dependency inventory exceeds its profile.');
  const refFor = (id: string) => {
    const ref = parseAssetRef(objects.get(id));
    const object = parsed.envelope.objects.find((item) => item.objectId === id);
    if (!ref || !object || ref.size !== object.size || ref.mimeType !== object.mimeType)
      throw new Error('Verified portable object binding is missing or inconsistent.');
    return ref;
  };
  if (
    (local.authorization !== undefined && !parseSyncConnectionIdentity(local.authorization)) ||
    !local.spaceId ||
    !Number.isSafeInteger(local.profileCreatedAt) ||
    local.profileCreatedAt < 0 ||
    !Array.isArray(local.expectedBasis) ||
    local.expectedBasis.length !== (local.expectedLocalGeneration === 0 ? 0 : 1) ||
    local.expectedBasis.some((id) => typeof id !== 'string' || !id || id.length > 256) ||
    !local.operationId ||
    local.operationId.length > 256 ||
    !/^[a-f0-9]{64}$/u.test(local.sourceDigest) ||
    !Number.isSafeInteger(local.connectionGeneration) ||
    local.connectionGeneration < 1 ||
    !Number.isSafeInteger(local.expectedLocalGeneration) ||
    local.expectedLocalGeneration < 0
  )
    throw new Error('Invalid local replica admission.');
  const identity = {
    ...(local.authorization !== undefined ? { authorization: local.authorization } : {}),
    spaceId: local.spaceId,
    profileCreatedAt: local.profileCreatedAt,
    expectedBasis: local.expectedBasis,
    operationId: local.operationId,
    sourceDigest: local.sourceDigest,
    connectionGeneration: local.connectionGeneration,
    expectedLocalGeneration: local.expectedLocalGeneration,
  };
  let payload: PreparedReplicaPayload;
  if (parsed.kind === 'media') {
    if (sender.length || local.dependencies.length)
      throw new Error('Unsupported media replica admission.');
    const rows = prepareMediaRows(parsed, refFor);
    payload = { kind: 'media', input: { ...identity, rows } };
  } else if (parsed.kind === 'image') {
    if (sender.length || local.dependencies.length)
      throw new Error('Unsupported image replica dependencies.');
    payload = {
      kind: 'image',
      input: {
        ...identity,
        expectedNativeRevision: local.expectedWorkspaceRevision,
        ...preparePortableImageRows(parsed.metadata, refFor),
      },
    };
  } else {
    if (
      local.expectedWorkspaceRevision !== null &&
      (!Number.isSafeInteger(local.expectedWorkspaceRevision) ||
        local.expectedWorkspaceRevision < 0)
    )
      throw new Error('Invalid local workspace revision.');
    if (parsed.kind === 'scenario-project') {
      assertCausalDependencies(
        new Set(
          portableSyncDependencyIds(
            parsed,
            sender.map((item) => item.mediaId)
          )
        ),
        local.dependencies,
        sender
      );
      if (!args.stageNativeMetadata)
        throw new Error('Scenario native metadata staging is unavailable.');
      const root = await preparePortableScenarioRoot({
        metadata: parsed.metadata,
        admission: local,
        refFor,
        stageNativeMetadata: args.stageNativeMetadata,
        objectIds: parsed.envelope.objects.map((object) => object.objectId),
      });
      payload = {
        kind: 'scenario-project',
        input: {
          ...identity,
          root,
          expectedWorkspaceRevision: local.expectedWorkspaceRevision,
          dependencies: local.dependencies,
        },
      };
    } else if (parsed.kind === 'video-review') {
      assertCausalDependencies(
        new Set(portableSyncDependencyIds(parsed)),
        local.dependencies,
        sender
      );
      const root = await preparePortableVideoReviewRoot({
        metadata: parsed.metadata,
        sourceMediaId: parsed.sourceMediaId,
        dependencies: local.dependencies,
        expectedLocalGeneration: local.expectedLocalGeneration,
        refFor,
      });
      payload = {
        kind: 'video-review',
        input: {
          ...identity,
          root,
          expectedWorkspaceRevision: local.expectedWorkspaceRevision,
          dependencies: local.dependencies,
        },
      };
    } else {
      const root = await prepareVideoRoot(parsed, local, sender, refFor, args.deferredExports);
      payload = {
        kind: 'video-project',
        input: {
          ...identity,
          root,
          expectedWorkspaceRevision: local.expectedWorkspaceRevision,
          dependencies: local.dependencies,
          ...(local.rootDependencies?.length ? { rootDependencies: local.rootDependencies } : {}),
        },
      };
    }
  }
  if (
    [...objects.keys()].some(
      (id) => !parsed.envelope.objects.some((object) => object.objectId === id)
    )
  )
    throw new Error('Verified object inventory contains an unknown object.');
  return payload;
}
