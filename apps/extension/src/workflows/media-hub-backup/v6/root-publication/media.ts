import {
  appendCommittedArchiveRootInTransaction,
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  discardPreparedAsset,
  readAssetFile,
  writeBlobToAsset,
  type AssetRef,
  type PhysicalDeleteAssetOperation,
} from '../../../../composition/persistence/assets';
import { putAggregatePresentationBackupRestore } from '../../../../composition/persistence/aggregate-presentations/backup-restore';
import { parseAggregatePresentationEntry } from '../../../../composition/persistence/aggregate-presentations/parser';
import type { AggregatePresentationEntry } from '../../../../composition/persistence/aggregate-presentations/contracts';
import { createAggregatePresentationKey } from '../../../../composition/persistence/aggregate-presentations/contracts';
import { decodePortableEditorDocument } from '../root-codecs/editor-document';
import { putImageWorkspaceBackupRestore } from '../../../../composition/persistence/image-workspaces/backup-restore';
import { parseImageWorkspaceEntry } from '../../../../composition/persistence/image-workspaces/parser';
import type { StoredImageWorkspaceEntry } from '../../../../composition/persistence/image-workspaces/contracts';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
  RECORDING_TELEMETRY_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  WEB_SNAPSHOTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../../../composition/persistence/infrastructure/indexed-db/mutation';
import { removeEditorDocumentOwnership } from '../../../../composition/persistence/document-assets';
import type { MediaThumbnailEntry } from '../../../../composition/persistence/media-library/contracts';
import {
  parseMediaLibraryEntry,
  parseMediaThumbnailEntry,
} from '../../../../composition/persistence/media-library/read-guards';
import { putRecordingBackupRestore } from '../../../../composition/persistence/recordings/backup-restore';
import type {
  RecordingTelemetryEntry,
  StoredRecordingEntry,
} from '../../../../composition/persistence/recordings/contracts';
import { parseRecordingEntry } from '../../../../composition/persistence/recordings/index.guards';
import { parseRecordingTelemetryEntry } from '../../../../composition/persistence/recordings/telemetry.guards';
import { createRecordingMediaId } from '../../../../features/media-hub/media-id';
import {
  readWebSnapshotPackageScreenshotBytes,
  sanitizeWebSnapshotPackageProvenance,
} from '../../../../features/web-snapshot/provenance';
import { isWebSnapshotManifest } from '../../../../features/web-snapshot/manifest';
import { putWebSnapshotBackupRestore } from '../../../../composition/persistence/web-snapshots/backup-restore';
import { parseStoredWebSnapshotRecord } from '../../../../composition/persistence/web-snapshots';
import type { StoredWebSnapshotRecord } from '../../../../composition/persistence/web-snapshots/contracts';
import { parsePortableMediaMetadata } from '../root-codecs/media';
import { assertPortableJson } from '../codec';
import type { ArchiveRootPublisher } from '../restore';
import type { StagedArchiveObject } from '../staging';
import type { MediaHubBackupRootEnvelope } from '../contracts';
import { rebaseTemporaryLifecycle } from '../restore-lifecycle';
import { validateRetainedWebSnapshotScreenshot } from '../../../../features/web-snapshot/screenshot-validation';

type MutableStore = {
  delete(key: IDBValidKey): Promise<unknown>;
  get(key: IDBValidKey): Promise<unknown>;
  put(value: unknown): Promise<unknown>;
};

interface MediaRestoreStores {
  media: MutableStore;
  owners: MutableStore & { index(name: 'assetId'): { count(assetId: string): Promise<number> } };
  presentations: MutableStore;
  recordings: MutableStore;
  refs: MutableStore;
  telemetry: MutableStore;
  thumbnails: MutableStore;
  snapshots: MutableStore;
  workspaces: MutableStore;
}

function newId(): string {
  if (typeof crypto.randomUUID !== 'function')
    throw new Error('Secure restore IDs are unavailable.');
  return crypto.randomUUID();
}

function objectMap(staged: readonly StagedArchiveObject[]) {
  return new Map(staged.map((object) => [object.objectId, object]));
}

function requireObject(
  objects: ReadonlyMap<string, StagedArchiveObject>,
  objectId: string
): StagedArchiveObject {
  const object = objects.get(objectId);
  if (!object) throw new Error(`Media archive object is missing: ${objectId}.`);
  return object;
}

async function unlinkAsset(args: {
  assetId: string;
  operation: PhysicalDeleteAssetOperation;
  ownerId: string;
  ownerKind: string;
  ownerStore: MutableStore & {
    index(name: 'assetId'): { count(assetId: string): Promise<number> };
  };
  refStore: MutableStore;
  role: string;
}) {
  await args.ownerStore.delete([args.ownerKind, args.ownerId, args.role]);
  if ((await args.ownerStore.index('assetId').count(args.assetId)) === 0) {
    await args.refStore.delete(args.assetId);
    args.operation.assetIds.push(args.assetId);
  }
}

async function deleteExistingMediaRoot(args: {
  mediaId: string;
  operation: PhysicalDeleteAssetOperation;
  stores: MediaRestoreStores;
}) {
  const current = parseMediaLibraryEntry(await args.stores.media.get(args.mediaId));
  if (!current) return;
  const workspace = parseImageWorkspaceEntry(await args.stores.workspaces.get(args.mediaId));
  if (workspace) {
    await removeEditorDocumentOwnership({
      document: workspace.document,
      ownerId: args.mediaId,
      ownerKind: 'image-workspace',
      physicalDelete: args.operation,
      stores: { owners: args.stores.owners, refs: args.stores.refs },
    });
  }
  await args.stores.workspaces.delete(args.mediaId);
  await args.stores.presentations.delete(
    createAggregatePresentationKey({ id: args.mediaId, kind: 'image' })
  );
  await args.stores.thumbnails.delete(args.mediaId);
  if (current.source.kind === 'recording') {
    const recording = parseRecordingEntry(
      await args.stores.recordings.get(current.source.recordingId)
    );
    if (recording) {
      await unlinkAsset({
        assetId: recording.assetId,
        operation: args.operation,
        ownerId: recording.id,
        ownerKind: 'recording',
        ownerStore: args.stores.owners,
        refStore: args.stores.refs,
        role: 'body',
      });
    }
    await args.stores.recordings.delete(current.source.recordingId);
    await args.stores.telemetry.delete(current.source.recordingId);
  }
  if (current.source.kind === 'web-snapshot') {
    const snapshot = parseStoredWebSnapshotRecord(
      await args.stores.snapshots.get(current.source.snapshotId)
    );
    if (snapshot) {
      await unlinkAsset({
        assetId: snapshot.packageAssetId,
        operation: args.operation,
        ownerId: snapshot.id,
        ownerKind: 'web-snapshot',
        ownerStore: args.stores.owners,
        refStore: args.stores.refs,
        role: 'package',
      });
      await unlinkAsset({
        assetId: snapshot.screenshotAssetId,
        operation: args.operation,
        ownerId: snapshot.id,
        ownerKind: 'web-snapshot',
        ownerStore: args.stores.owners,
        refStore: args.stores.refs,
        role: 'screenshot',
      });
    }
    await args.stores.snapshots.delete(current.source.snapshotId);
  }
  await args.stores.media.delete(args.mediaId);
}

function remapMediaIdentity(
  metadata: ReturnType<typeof parsePortableMediaMetadata>,
  duplicate: boolean
) {
  if (!duplicate) return metadata.entry;
  if (metadata.recording) {
    const recordingId = newId();
    return {
      ...metadata.entry,
      id: createRecordingMediaId(recordingId),
      source: { kind: 'recording' as const, recordingId },
    };
  }
  if (metadata.webSnapshot) {
    const id = newId();
    return { ...metadata.entry, id, source: { kind: 'web-snapshot' as const, snapshotId: id } };
  }
  return { ...metadata.entry, id: newId() };
}

type PortableMedia = ReturnType<typeof parsePortableMediaMetadata>;

const WEB_SNAPSHOT_SCREENSHOT_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];
async function validateRestoredWebSnapshotScreenshot(args: {
  packageBlob: Blob;
  screenshotBlob: Blob;
}): Promise<void> {
  await validateRetainedWebSnapshotScreenshot({
    packageBytes: await readWebSnapshotPackageScreenshotBytes(args.packageBlob),
    screenshotBlob: args.screenshotBlob,
  });
}

async function replaceSanitizedSnapshotPackage(args: {
  envelope: MediaHubBackupRootEnvelope;
  staged: StagedArchiveObject[];
}): Promise<{ envelope: MediaHubBackupRootEnvelope; staged: StagedArchiveObject[] }> {
  const metadata = parsePortableMediaMetadata(args.envelope.metadata);
  if (!metadata.webSnapshot) return args;
  if (!isWebSnapshotManifest(metadata.webSnapshot.entry.manifest)) {
    throw new Error('Restored web snapshot manifest is invalid.');
  }
  const objects = objectMap(args.staged);
  const packageObject = requireObject(objects, metadata.webSnapshot.packageObjectId);
  const screenshotObject = requireObject(objects, metadata.webSnapshot.screenshotObjectId);
  if (packageObject.ref.mimeType.toLowerCase() !== 'application/zip') {
    throw new Error('Restored web snapshot package MIME type is invalid.');
  }
  if (!WEB_SNAPSHOT_SCREENSHOT_MIME_TYPES.includes(screenshotObject.ref.mimeType.toLowerCase())) {
    throw new Error('Restored web snapshot screenshot MIME type is invalid.');
  }
  const packageFile = await readAssetFile(packageObject.ref, `${metadata.entry.id}-snapshot.zip`);
  const sanitized = await sanitizeWebSnapshotPackageProvenance(
    packageFile,
    metadata.webSnapshot.entry.manifest,
    { requireManifestMatch: true }
  );
  const screenshotFile = await readAssetFile(
    screenshotObject.ref,
    `${metadata.entry.id}-screenshot`
  );
  await validateRestoredWebSnapshotScreenshot({
    packageBlob: sanitized.packageBlob,
    screenshotBlob: screenshotFile,
  });
  let staged = args.staged;
  if (sanitized.changed) {
    const replacement = await writeBlobToAsset(sanitized.packageBlob);
    try {
      await discardPreparedAsset(packageObject.ref.assetId);
    } catch (error) {
      await discardPreparedAsset(replacement.ref.assetId).catch((cleanupError: unknown) => {
        throw new AggregateError(
          [error, cleanupError],
          'Sanitized web snapshot package cleanup failed.',
          { cause: error }
        );
      });
      throw error;
    }
    staged = args.staged.map((object) =>
      object.objectId === packageObject.objectId
        ? { ...replacement, objectId: packageObject.objectId }
        : object
    );
  }
  const nextMetadata = {
    ...metadata,
    webSnapshot: {
      ...metadata.webSnapshot,
      entry: {
        ...metadata.webSnapshot.entry,
        manifest: sanitized.manifest,
        size: sanitized.size,
      },
    },
  };
  assertPortableJson(nextMetadata);
  return {
    envelope: {
      ...args.envelope,
      metadata: nextMetadata,
    },
    staged,
  };
}
type StagedObjectMap = ReadonlyMap<string, StagedArchiveObject>;

async function hasMediaSourceConflict(metadata: PortableMedia): Promise<boolean> {
  return runWithIndexedDbMutation(async (db) => {
    const relatedId =
      metadata.entry.source.kind === 'recording'
        ? metadata.entry.source.recordingId
        : metadata.entry.source.kind === 'web-snapshot'
          ? metadata.entry.source.snapshotId
          : null;
    const values = await Promise.all([
      db.get(MEDIA_LIBRARY_STORE, metadata.entry.id),
      db.get(IMAGE_WORKSPACES_STORE, metadata.entry.id),
      db.get(
        AGGREGATE_PRESENTATIONS_STORE,
        createAggregatePresentationKey({ id: metadata.entry.id, kind: 'image' })
      ),
      relatedId && metadata.recording ? db.get(STORE_NAME, relatedId) : undefined,
      relatedId && metadata.webSnapshot ? db.get(WEB_SNAPSHOTS_STORE, relatedId) : undefined,
    ]);
    return values.some((value) => value !== undefined);
  });
}

function prepareRecording(args: {
  metadata: PortableMedia;
  original: StagedArchiveObject;
  targetEntry: PortableMedia['entry'];
}): { recording: StoredRecordingEntry | null; telemetry?: RecordingTelemetryEntry } {
  const recordingId =
    args.targetEntry.source.kind === 'recording' ? args.targetEntry.source.recordingId : null;
  const recording =
    args.metadata.recording && recordingId
      ? parseRecordingEntry({
          ...args.metadata.recording.entry,
          assetId: args.original.ref.assetId,
          id: recordingId,
          mimeType: args.original.ref.mimeType,
          size: args.original.ref.size,
        })
      : null;
  if (args.metadata.recording && !recording) {
    throw new Error('Restored recording metadata is invalid.');
  }
  const telemetry =
    recording && args.metadata.recording?.telemetry
      ? (parseRecordingTelemetryEntry({
          ...args.metadata.recording.telemetry,
          recordingId: recording.id,
        }) ?? undefined)
      : undefined;
  if (recording && args.metadata.recording?.telemetry && !telemetry) {
    throw new Error('Restored recording telemetry is invalid.');
  }
  return { recording, ...(telemetry ? { telemetry } : {}) };
}

function prepareSnapshot(args: {
  metadata: PortableMedia;
  objects: StagedObjectMap;
  targetEntry: PortableMedia['entry'];
}): StoredWebSnapshotRecord | null {
  if (!args.metadata.webSnapshot || args.targetEntry.source.kind !== 'web-snapshot') return null;
  const packageObject = requireObject(args.objects, args.metadata.webSnapshot.packageObjectId);
  const screenshotObject = requireObject(
    args.objects,
    args.metadata.webSnapshot.screenshotObjectId
  );
  const snapshot = parseStoredWebSnapshotRecord({
    ...args.metadata.webSnapshot.entry,
    id: args.targetEntry.source.snapshotId,
    packageAssetId: packageObject.ref.assetId,
    screenshotAssetId: screenshotObject.ref.assetId,
    screenshotMimeType: screenshotObject.ref.mimeType,
    screenshotSize: screenshotObject.ref.size,
    size: packageObject.ref.size,
  });
  if (!snapshot) throw new Error('Restored web snapshot metadata is invalid.');
  return snapshot;
}

async function prepareThumbnail(args: {
  mediaId: string;
  metadata: PortableMedia;
  objects: StagedObjectMap;
}): Promise<MediaThumbnailEntry | null> {
  if (!args.metadata.thumbnail) return null;
  const file = await readAssetFile(
    requireObject(args.objects, args.metadata.thumbnail.objectId).ref,
    `${args.mediaId}-thumbnail`
  );
  const thumbnail = parseMediaThumbnailEntry({
    ...args.metadata.thumbnail,
    assetId: args.mediaId,
    blob: file,
  });
  if (!thumbnail) throw new Error('Restored media thumbnail is invalid.');
  return thumbnail;
}

function prepareWorkspace(args: {
  mediaId: string;
  metadata: PortableMedia;
  objects: StagedObjectMap;
}): { refs: AssetRef[]; workspace: StoredImageWorkspaceEntry | null } {
  if (!args.metadata.workspace) return { refs: [], workspace: null };
  const portableAssets = args.metadata.workspace.document.assets;
  const assetsByObjectId = new Map(
    portableAssets.map(({ objectId }) => [
      objectId,
      requireObject(args.objects, objectId).ref.assetId,
    ])
  );
  const document = decodePortableEditorDocument({
    document: args.metadata.workspace.document,
    assetsByObjectId,
  });
  const workspace = parseImageWorkspaceEntry({
    ...args.metadata.workspace,
    aggregateId: args.mediaId,
    document,
  });
  if (!workspace) throw new Error('Restored image workspace is invalid.');
  const refs = [...new Set(portableAssets.map(({ objectId }) => objectId))].map(
    (objectId) => requireObject(args.objects, objectId).ref
  );
  return { refs, workspace };
}

async function preparePresentation(args: {
  mediaId: string;
  metadata: PortableMedia;
  objects: StagedObjectMap;
}): Promise<AggregatePresentationEntry | null> {
  if (!args.metadata.presentation) return null;
  const thumbnailBlob = await readAssetFile(
    requireObject(args.objects, args.metadata.presentation.thumbnailObjectId).ref,
    `${args.mediaId}-presentation-thumbnail`
  );
  const previewBlob = args.metadata.presentation.previewObjectId
    ? await readAssetFile(
        requireObject(args.objects, args.metadata.presentation.previewObjectId).ref,
        `${args.mediaId}-preview`
      )
    : undefined;
  const presentation = parseAggregatePresentationEntry({
    ...args.metadata.presentation.entry,
    aggregateId: args.mediaId,
    thumbnailBlob,
    ...(previewBlob ? { previewBlob } : {}),
  });
  if (!presentation) throw new Error('Restored aggregate presentation is invalid.');
  return presentation;
}

async function prepareMediaRoot(args: {
  metadata: PortableMedia;
  objects: StagedObjectMap;
  strategy: 'replace' | 'skip' | 'duplicate';
}) {
  const original = requireObject(args.objects, args.metadata.originalObjectId);
  const targetEntry = remapMediaIdentity(
    args.metadata,
    args.strategy === 'duplicate' && (await hasMediaSourceConflict(args.metadata))
  );
  const restoredEntry = rebaseTemporaryLifecycle(targetEntry);
  const screenshotBlob =
    restoredEntry.source.kind === 'screenshot'
      ? await readAssetFile(original.ref, restoredEntry.filename)
      : undefined;
  const media = parseMediaLibraryEntry({
    ...restoredEntry,
    ...(screenshotBlob ? { blob: screenshotBlob } : {}),
  });
  if (!media) throw new Error('Restored media metadata is invalid.');
  const recording = prepareRecording({
    metadata: args.metadata,
    original,
    targetEntry: restoredEntry,
  });
  const snapshot = prepareSnapshot({
    metadata: args.metadata,
    objects: args.objects,
    targetEntry: restoredEntry,
  });
  const [thumbnail, presentation] = await Promise.all([
    prepareThumbnail({ mediaId: restoredEntry.id, metadata: args.metadata, objects: args.objects }),
    preparePresentation({
      mediaId: restoredEntry.id,
      metadata: args.metadata,
      objects: args.objects,
    }),
  ]);
  const workspace = prepareWorkspace({
    mediaId: restoredEntry.id,
    metadata: args.metadata,
    objects: args.objects,
  });
  return { media, original, presentation, snapshot, thumbnail, ...recording, ...workspace };
}

type PreparedMediaRoot = Awaited<ReturnType<typeof prepareMediaRoot>>;

async function detectMediaConflicts(stores: MediaRestoreStores, prepared: PreparedMediaRoot) {
  const current = parseMediaLibraryEntry(await stores.media.get(prepared.media.id));
  const relatedConflict = prepared.recording
    ? Boolean(await stores.recordings.get(prepared.recording.id))
    : prepared.snapshot
      ? Boolean(await stores.snapshots.get(prepared.snapshot.id))
      : false;
  const sidecarConflict = Boolean(
    (await stores.workspaces.get(prepared.media.id)) ||
    (await stores.presentations.get(
      createAggregatePresentationKey({ id: prepared.media.id, kind: 'image' })
    ))
  );
  return {
    conflict: Boolean(current || relatedConflict || sidecarConflict),
    current,
    relatedConflict,
    sidecarConflict,
  };
}

async function publishPreparedMedia(args: {
  metadata: PortableMedia;
  objects: StagedObjectMap;
  prepared: PreparedMediaRoot;
  stores: MediaRestoreStores;
}) {
  await args.stores.media.put(args.prepared.media);
  if (args.prepared.thumbnail) await args.stores.thumbnails.put(args.prepared.thumbnail);
  if (args.prepared.recording) {
    await putRecordingBackupRestore({
      entry: args.prepared.recording,
      ownerStore: args.stores.owners,
      ref: args.prepared.original.ref,
      refStore: args.stores.refs,
      recordingStore: args.stores.recordings,
      ...(args.prepared.telemetry ? { telemetry: args.prepared.telemetry } : {}),
      telemetryStore: args.stores.telemetry,
    });
  }
  if (args.prepared.snapshot && args.metadata.webSnapshot) {
    await putWebSnapshotBackupRestore({
      ownerStore: args.stores.owners,
      packageRef: requireObject(args.objects, args.metadata.webSnapshot.packageObjectId).ref,
      record: args.prepared.snapshot,
      refStore: args.stores.refs,
      screenshotRef: requireObject(args.objects, args.metadata.webSnapshot.screenshotObjectId).ref,
      snapshotStore: args.stores.snapshots,
    });
  }
  if (args.prepared.workspace) {
    await putImageWorkspaceBackupRestore({
      entry: args.prepared.workspace,
      ownerStore: args.stores.owners,
      refsByAssetId: new Map(args.prepared.refs.map((ref) => [ref.assetId, ref])),
      refStore: args.stores.refs,
      workspaceStore: args.stores.workspaces,
    });
  }
  if (args.prepared.presentation) {
    await putAggregatePresentationBackupRestore({
      entry: args.prepared.presentation,
      store: args.stores.presentations,
    });
  }
}

async function commitPreparedMediaRoot(args: {
  metadata: PortableMedia;
  objects: StagedObjectMap;
  operation: PhysicalDeleteAssetOperation;
  prepared: PreparedMediaRoot;
  rootKey: string;
  session: { operationId: string; strategy: 'replace' | 'skip' | 'duplicate' };
}) {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        MEDIA_LIBRARY_STORE,
        THUMBNAILS_STORE,
        IMAGE_WORKSPACES_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        STORE_NAME,
        RECORDING_TELEMETRY_STORE,
        WEB_SNAPSHOTS_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_OPERATIONS_STORE,
      ],
      'readwrite'
    );
    const stores = {
      media: tx.objectStore(MEDIA_LIBRARY_STORE),
      owners: tx.objectStore(ASSET_OWNERS_STORE),
      presentations: tx.objectStore(AGGREGATE_PRESENTATIONS_STORE),
      recordings: tx.objectStore(STORE_NAME),
      refs: tx.objectStore(ASSET_REFS_STORE),
      telemetry: tx.objectStore(RECORDING_TELEMETRY_STORE),
      thumbnails: tx.objectStore(THUMBNAILS_STORE),
      snapshots: tx.objectStore(WEB_SNAPSHOTS_STORE),
      workspaces: tx.objectStore(IMAGE_WORKSPACES_STORE),
    };
    const conflict = await detectMediaConflicts(stores, args.prepared);
    if (conflict.conflict && args.session.strategy === 'skip') {
      await appendCommittedArchiveRootInTransaction(
        tx.objectStore(ASSET_OPERATIONS_STORE),
        args.session.operationId,
        args.rootKey,
        args.prepared.media.id,
        false,
        true
      );
      await tx.done;
      return { conflicted: true, imported: false };
    }
    if (conflict.conflict && args.session.strategy === 'duplicate') {
      throw new Error('Media restore conflict changed after preflight.');
    }
    if (
      !conflict.current &&
      (conflict.relatedConflict || conflict.sidecarConflict) &&
      args.session.strategy === 'replace'
    ) {
      throw new Error('Media restore child belongs to another root.');
    }
    if (conflict.current && args.session.strategy === 'replace') {
      await deleteExistingMediaRoot({
        mediaId: args.prepared.media.id,
        operation: args.operation,
        stores,
      });
    }
    await publishPreparedMedia({ ...args, stores });
    if (args.operation.assetIds.length > 0) {
      await tx.objectStore(ASSET_OPERATIONS_STORE).put(args.operation);
    }
    await appendCommittedArchiveRootInTransaction(
      tx.objectStore(ASSET_OPERATIONS_STORE),
      args.session.operationId,
      args.rootKey,
      args.prepared.media.id,
      true,
      conflict.conflict
    );
    await tx.done;
    return { conflicted: conflict.conflict, imported: true };
  });
}

function retainedMediaAssetIds(args: {
  imported: boolean;
  metadata: PortableMedia;
  objects: StagedObjectMap;
  prepared: PreparedMediaRoot;
}): string[] {
  if (!args.imported) return [];
  return [
    ...(args.prepared.recording ? [args.prepared.original.ref.assetId] : []),
    ...(args.prepared.snapshot && args.metadata.webSnapshot
      ? [
          requireObject(args.objects, args.metadata.webSnapshot.packageObjectId).ref.assetId,
          requireObject(args.objects, args.metadata.webSnapshot.screenshotObjectId).ref.assetId,
        ]
      : []),
    ...args.prepared.refs.map((ref) => ref.assetId),
  ];
}

export const mediaLibraryRootPublisher: ArchiveRootPublisher = {
  profile: 'media:library-item',
  prepareStaged: replaceSanitizedSnapshotPackage,
  async checkpointSkipIfExisting({ envelope, session }) {
    const metadata = parsePortableMediaMetadata(envelope.metadata);
    return runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction([MEDIA_LIBRARY_STORE, ASSET_OPERATIONS_STORE], 'readwrite');
      if (!(await tx.objectStore(MEDIA_LIBRARY_STORE).get(metadata.entry.id))) {
        await tx.done;
        return false;
      }
      await appendCommittedArchiveRootInTransaction(
        tx.objectStore(ASSET_OPERATIONS_STORE),
        session.operationId,
        `media:library-item:${envelope.descriptor.rootId}`,
        metadata.entry.id,
        false,
        true
      );
      await tx.done;
      return true;
    });
  },
  async publish({ envelope, session, staged }) {
    const metadata = parsePortableMediaMetadata(envelope.metadata);
    const objects = objectMap(staged);
    const prepared = await prepareMediaRoot({ metadata, objects, strategy: session.strategy });
    const operation = buildPhysicalDeleteOperation([]);
    const result = await commitPreparedMediaRoot({
      metadata,
      objects,
      operation,
      prepared,
      rootKey: `media:library-item:${envelope.descriptor.rootId}`,
      session,
    });
    if (operation.assetIds.length > 0) {
      await completePhysicalDeleteOperation(operation).catch(() => undefined);
    }
    return {
      ...result,
      retainedAssetIds: retainedMediaAssetIds({
        imported: result.imported,
        metadata,
        objects,
        prepared,
      }),
    };
  },
};
