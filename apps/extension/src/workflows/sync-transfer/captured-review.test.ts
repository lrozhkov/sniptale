import { beforeEach, expect, it, vi } from 'vitest';
import {
  createArchivePathAllocator,
  sanitizeArchivePathSegment,
} from '../../composition/archive-transfer';
import type { AssetRef } from '../../composition/persistence/assets';
import {
  buildProjectAssetMediaEntry,
  buildProjectExportMediaEntry,
} from '../../composition/persistence/media-library/entry-mapping';
import {
  createProjectAssetEntry,
  createProjectExportEntry,
} from '../../composition/persistence/projects/index.test-support';
import { workspace as reviewWorkspace } from '../../composition/persistence/review-workspaces/backup-restore.test-support';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import { materializeVideoWorkspaceProject } from '../../composition/persistence/review-workspaces/project-metadata';
import type { CapturedVideoReviewRows } from '../../composition/persistence/sync-capture/review-snapshot';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import { buildMediaRootInventory } from '../media-hub-backup/v6/inventory/media';
import { createMediaHubBackupExportOptions } from '../media-hub-backup/v6/options';
import { parsePortableMediaMetadata } from '../media-hub-backup/v6/root-codecs/media';
import { encodeCapturedVideoReviewRoot } from './captured-review';
import { preparePortableReplica, parsePortableSyncRoot } from './prepared-root';
import { nestedMediaReviewFixture } from '../media-hub-backup/v6/root-publication/media.review-assets.test-support';
import { createCleanupWebSnapshotRecord } from '../media-hub/cleanup.test-support';
import { PAGE_PACKAGE_ARCHIVE_MIME_TYPE } from '@sniptale/runtime-contracts/page-package';
import { createMediaLibraryEntry } from '../../composition/persistence/projects/index.test-support';
import { createNativeCapture } from '../../composition/persistence/sync-capture/test-support/frozen-snapshot-database';
import { captureRootKey } from '../../composition/persistence/sync-capture/contracts';
import { encodeCapturedPortableRoot } from './captured-root';

const io = vi.hoisted(() => ({ read: vi.fn(), liveRead: vi.fn(), files: new Map<string, File>() }));
vi.mock('../../features/web-snapshot/provenance', async (original) => ({
  ...(await original<typeof import('../../features/web-snapshot/provenance')>()),
  sanitizeWebSnapshotPackageProvenance: async (packageBlob: Blob, manifest: unknown) => ({
    packageBlob,
    manifest,
    changed: false,
  }),
}));
vi.mock('../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets')>()),
  readAssetFile: io.read,
}));
vi.mock('../../composition/persistence/review-workspaces/store', () => ({
  readVideoWorkspace: io.liveRead,
}));
vi.mock('../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: io.liveRead,
}));
beforeEach(() => {
  vi.clearAllMocks();
  io.files.clear();
  io.liveRead.mockRejectedValue(new Error('Live workspace reads are forbidden.'));
  io.read.mockImplementation(async (ref: AssetRef, filename: string) => {
    const file = new File([new Uint8Array(ref.size)], filename, { type: ref.mimeType });
    io.files.set(ref.assetId, file);
    return file;
  });
});

function assetRef(entry: { assetId: string; size: number; mimeType: string }): AssetRef {
  return {
    assetId: entry.assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${entry.assetId}` },
    mimeType: entry.mimeType,
    size: entry.size,
    sha256: null,
  };
}

function reviewRows(archived = false): CapturedVideoReviewRows & {
  source: Extract<CapturedVideoReviewRows['source'], { projectAsset: unknown }>;
} {
  const original = createProjectAssetEntry({
    id: 'source',
    assetId: 'source-original',
    mimeType: 'video/webm',
    size: 6,
  });
  const supplementary = createProjectAssetEntry({
    id: 'camera',
    assetId: 'camera-original',
    mimeType: 'video/webm',
    size: 6,
  });
  const libraryLifecycle = { storageClass: 'library' as const, savedAt: 1, updatedAt: 1 };
  const media = {
    ...buildProjectAssetMediaEntry(original),
    filename: 'movie: original.webm',
    originalFilename: 'movie: original.webm',
    lifecycle: libraryLifecycle,
  };
  const aggregateId = archived ? 'project-asset:quick-project:previous' : media.id;
  const workspace = parseVideoWorkspace({
    ...reviewWorkspace,
    aggregateId,
    sourceAssetId: original.assetId,
    ...(archived ? { sourceMediaId: media.id } : {}),
    advanced: {
      ...reviewWorkspace.advanced,
      webcam: createQuickEditWebcam(
        `project-asset:${supplementary.id}`,
        reviewWorkspace.source,
        reviewWorkspace.source
      ),
    },
  });
  if (!workspace) throw new Error('Invalid video review fixture.');
  return {
    source: { media, projectAsset: original, ref: assetRef(original) },
    review: {
      workspace: materializeVideoWorkspaceProject(workspace, 'Saved video review'),
      draft: {
        aggregateId,
        revision: workspace.revision,
        annotation: { id: 'draft', text: 'Unfinished comment', anchor: { kind: 'point', time: 1 } },
        before: null,
        updatedAt: 4,
      },
    },
    assets: [supplementary],
    refs: [assetRef(supplementary)],
    media: [{ ...buildProjectAssetMediaEntry(supplementary), lifecycle: libraryLifecycle }],
    privateReviews: [],
    thumbnail: {
      assetId: aggregateId,
      blob: new Blob(['preview'], { type: 'image/png' }),
      createdAt: 1,
      updatedAt: 2,
      width: 100,
      height: 80,
    },
  };
}

function backupDatabase(rows: CapturedVideoReviewRows) {
  const values = new Map<string, Map<string, unknown>>([
    [
      'media_library',
      new Map([rows.source.media, ...rows.media].map((entry) => [entry.id, entry])),
    ],
    [
      'project_assets',
      new Map(
        [...('projectAsset' in rows.source ? [rows.source.projectAsset] : []), ...rows.assets].map(
          (entry) => [entry.id, entry]
        )
      ),
    ],
    ['asset_refs', new Map([rows.source.ref, ...rows.refs].map((ref) => [ref.assetId, ref]))],
    [
      'video_workspaces',
      new Map(
        [rows.review, ...rows.privateReviews].map((review) => [
          review.workspace.aggregateId,
          review.workspace,
        ])
      ),
    ],
    [
      'video_workspace_drafts',
      new Map(
        [rows.review, ...rows.privateReviews].map((review) => [
          review.workspace.aggregateId,
          review.draft ?? undefined,
        ])
      ),
    ],
    ['thumbnails', new Map(rows.thumbnail ? [[rows.thumbnail.assetId, rows.thumbnail]] : [])],
  ]);
  const get = vi.fn(async (store: string, key: unknown) =>
    typeof key === 'string' ? values.get(store)?.get(key) : undefined
  );
  return {
    get,
    transaction: () => ({
      done: Promise.resolve(),
      objectStore: (store: string) => ({
        get: (key: string) => get(store, key),
        index: () => ({ getAll: async () => [] }),
      }),
    }),
  };
}

it.each([false, true])(
  'keeps independent export review editing closure without its parent (archived=%s)',
  async (archived) => {
    const original = reviewRows();
    const projectExport = createProjectExportEntry({
      id: 'saved-export',
      projectId: 'absent-parent',
      assetId: original.source.ref.assetId,
      size: original.source.ref.size,
      mimeType: original.source.ref.mimeType,
    });
    const media = { ...buildProjectExportMediaEntry(projectExport), workspaceRevision: 0 };
    const aggregateId = archived ? 'export:quick-project:old' : media.id;
    const rows: CapturedVideoReviewRows = {
      ...original,
      source: { media, projectExport, ref: original.source.ref },
      review: {
        workspace: { ...original.review.workspace, aggregateId, sourceMediaId: media.id },
        draft: original.review.draft ? { ...original.review.draft, aggregateId } : null,
      },
      ...(original.thumbnail ? { thumbnail: { ...original.thumbnail, assetId: aggregateId } } : {}),
    };
    const encoded = await encodeCapturedVideoReviewRoot(rows);
    expect(encoded.reviewSourceMediaId).toBe(media.id);
    const parsed = await parsePortableSyncRoot(encoded.envelope, media.id);
    expect(parsed.kind).toBe('video-review');
    const metadata = parsePortableMediaMetadata(encoded.envelope.metadata);
    expect(metadata.projectExport?.projectId).toBe('absent-parent');
    const verified = new Map(encoded.bindings.map((binding) => [binding.objectId, binding.ref]));
    for (const object of encoded.envelope.objects)
      if (!verified.has(object.objectId))
        verified.set(object.objectId, {
          ...original.source.ref,
          assetId: object.objectId,
          size: object.size,
          mimeType: object.mimeType,
          location: { kind: 'opfs', objectKey: `objects/${object.objectId}` },
        });
    const dependency = {
      entry: media,
      ref: original.source.ref,
      expectedGeneration: 1,
      expectedBasis: ['source-op'],
    };
    const supplementary = original.media.map((entry) => ({
      entry,
      ref: original.refs[0]!,
      expectedGeneration: 1,
      expectedBasis: ['camera-op'],
    }));
    const dependencies = [dependency, ...supplementary];
    const prepared = await preparePortableReplica({
      envelope: encoded.envelope,
      reviewSourceMediaId: media.id,
      verifiedObjects: verified,
      senderDependencies: dependencies.map((item) => ({
        mediaId: item.entry.id,
        basis: item.expectedBasis,
      })),
      admission: {
        spaceId: 'space',
        profileCreatedAt: 1,
        connectionGeneration: 1,
        operationId: 'incoming-export-review',
        sourceDigest: 'a'.repeat(64),
        expectedLocalGeneration: 0,
        expectedBasis: [],
        expectedWorkspaceRevision: null,
        dependencies,
      },
    });
    expect(prepared.kind).toBe('video-review');
    if (prepared.kind === 'video-review') expect(prepared.input.root.sourceMediaId).toBe(media.id);
    expect(io.liveRead).not.toHaveBeenCalled();
  }
);

it('round trips frozen saved snapshot metadata with both native asset bindings', async () => {
  const webSnapshot = createCleanupWebSnapshotRecord('saved-page');
  const ref = assetRef({
    assetId: webSnapshot.packageAssetId,
    size: webSnapshot.size,
    mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
  });
  const screenshotRef = assetRef({
    assetId: webSnapshot.screenshotAssetId,
    size: webSnapshot.screenshotSize,
    mimeType: webSnapshot.screenshotMimeType,
  });
  const media = createMediaLibraryEntry({
    id: webSnapshot.id,
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: webSnapshot.id },
    size: ref.size,
    mimeType: ref.mimeType,
    filename: 'page.sniptale-page-package.zip',
    originalFilename: 'page.sniptale-page-package.zip',
    workspaceRevision: 0,
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
  });
  const captured = createNativeCapture({
    version: 1,
    kind: 'sync-operation',
    key: 'snapshot-op',
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 1,
    rootKind: 'media',
    rootId: media.id,
    rootKey: captureRootKey('space', 'media', media.id),
    generation: 1,
    operationId: 'snapshot-op',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change: { kind: 'media', rows: { media, webSnapshot, ref, screenshotRef } },
  });
  const portable = await encodeCapturedPortableRoot(captured);
  const metadata = parsePortableMediaMetadata(portable.envelope.metadata);
  expect(portable.bindings).toEqual(
    expect.arrayContaining([
      { objectId: metadata.originalObjectId, ref },
      { objectId: metadata.webSnapshot!.screenshotObjectId, ref: screenshotRef },
    ])
  );
  const incoming = new Map(
    portable.envelope.objects.map((object) => [
      object.objectId,
      {
        ...ref,
        assetId: `incoming-${object.objectId}`,
        size: object.size,
        mimeType: object.mimeType,
        location: { kind: 'opfs' as const, objectKey: `objects/incoming-${object.objectId}` },
      },
    ])
  );
  const payload = await preparePortableReplica({
    envelope: portable.envelope,
    verifiedObjects: incoming,
    senderDependencies: [],
    admission: {
      spaceId: 'space',
      profileCreatedAt: 1,
      connectionGeneration: 1,
      operationId: 'snapshot-received',
      sourceDigest: 'a'.repeat(64),
      expectedLocalGeneration: 0,
      expectedBasis: [],
      expectedWorkspaceRevision: null,
      dependencies: [],
    },
  });
  expect(payload.kind).toBe('media');
  if (payload.kind !== 'media' || !('webSnapshot' in payload.input.rows))
    throw new Error('Expected saved snapshot.');
  expect(payload.input.rows.webSnapshot.packageAssetId).toBe(
    incoming.get(metadata.originalObjectId)!.assetId
  );
  expect(payload.input.rows.webSnapshot.screenshotAssetId).toBe(
    incoming.get(metadata.webSnapshot!.screenshotObjectId)!.assetId
  );
  expect(payload.input.rows.webSnapshot.manifest).toEqual(webSnapshot.manifest);
  expect(io.liveRead).not.toHaveBeenCalled();
});

it.each([false, true])(
  'matches the actual backup carrier without native aliases (archived=%s)',
  async (archived) => {
    const rows = reviewRows(archived);
    const aggregateId = rows.review.workspace.aggregateId;
    const db = backupDatabase(rows);
    const roots = await buildMediaRootInventory({
      db,
      items: [{ ...rows.source.media, hasThumbnail: false }],
      ...(archived ? { reviewWorkspaceHeads: [rows.review.workspace] } : {}),
      expectedReview: rows.review,
      options: createMediaHubBackupExportOptions({
        includeWebSnapshots: false,
        scope: 'selected',
        selected: { mediaAssetIds: [aggregateId], scenarioProjectIds: [], videoProjectIds: [] },
      }),
      paths: createArchivePathAllocator(),
    });
    expect(roots).toHaveLength(1);
    const backup = await roots[0]!.load();
    const encoded = await encodeCapturedVideoReviewRoot(rows);
    expect(encoded.envelope.metadata).toEqual(JSON.parse(JSON.stringify(backup.metadata)));
    expect(encoded.envelope.objects).toEqual(
      backup.objects.map((object) => ({
        ...object.ref,
        filename: sanitizeArchivePathSegment(object.ref.filename),
      }))
    );
    expect(encoded.envelope.descriptor).toEqual({
      ...roots[0]!.descriptor,
      metadataPath: 'Metadata/sync-root.json',
    });
    expect(encoded.reviewSourceMediaId).toBe(rows.source.media.id);
    const metadata = parsePortableMediaMetadata(encoded.envelope.metadata);
    expect(metadata.videoReview?.workspace.aggregateId).toBe(aggregateId);
    expect(metadata.videoReview?.workspace.project?.name).toBe('Saved video review');
    expect(metadata.videoReview?.workspace.history).toEqual(rows.review.workspace.history);
    expect(metadata.videoReview?.draft).toEqual(rows.review.draft);
    expect(metadata.thumbnail).toBeDefined();
    expect(encoded.bindings).toEqual([
      { objectId: metadata.originalObjectId, ref: rows.source.ref },
      { objectId: metadata.reviewAssets![0]!.objectId, ref: rows.refs[0] },
    ]);
    for (const binding of encoded.bindings)
      expect(encoded.objects.find((object) => object.ref.objectId === binding.objectId)?.blob).toBe(
        io.files.get(binding.ref.assetId)
      );
    expect(encoded.objects).toHaveLength(3);
    expect(encoded.bindings).toHaveLength(2);
    expect(JSON.stringify(encoded.envelope)).not.toContain('source-original');
    expect(JSON.stringify(encoded.envelope)).not.toContain('camera-original');
    if (archived)
      expect(
        db.get.mock.calls.filter(([store]) => store === 'media_library').map(([, key]) => key)
      ).not.toContain(aggregateId);
    expect(io.liveRead).not.toHaveBeenCalled();
  }
);

it('detaches the original, review, resources and draft before the first asynchronous source read', async () => {
  const rows = reviewRows(true);
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  io.read.mockImplementationOnce(async (ref: AssetRef, filename: string) => {
    entered();
    await gate;
    return new File([new Uint8Array(ref.size)], filename, { type: ref.mimeType });
  });
  const pending = encodeCapturedVideoReviewRoot(rows);
  await started;
  rows.source.media.filename = 'Live replacement';
  rows.source.ref.assetId = 'live-original';
  rows.assets[0]!.assetId = 'live-camera';
  rows.refs[0]!.assetId = 'live-camera';
  rows.review.workspace.project!.name = 'Live replacement';
  rows.review.draft!.annotation.text = 'Live replacement';
  release();
  const encoded = await pending;
  expect(JSON.stringify(encoded.envelope)).not.toContain('Live replacement');
  expect(encoded.bindings.map((binding) => binding.ref.assetId)).toEqual([
    'source-original',
    'camera-original',
  ]);
  expect(io.liveRead).not.toHaveBeenCalled();
});

it('refuses missing native refs before reads and mismatched or missing source objects', async () => {
  const rows = reviewRows();
  rows.refs = [];
  await expect(encodeCapturedVideoReviewRoot(rows)).rejects.toThrow('Invalid frozen video review');
  expect(io.read).not.toHaveBeenCalled();
  io.read.mockResolvedValue(new File(['short'], 'camera.webm', { type: 'video/webm' }));
  await expect(encodeCapturedVideoReviewRoot(reviewRows())).rejects.toThrow(
    /inconsistent|native reference/u
  );
  io.read.mockRejectedValue(new Error('Source object is missing.'));
  await expect(encodeCapturedVideoReviewRoot(reviewRows())).rejects.toThrow(
    'Source object is missing'
  );
});

it('refuses a missing private sidecar resource before reading files', async () => {
  const rows = reviewRows();
  rows.media = [];
  const asset = rows.assets[0]!;
  const workspace = parseVideoWorkspace({
    ...reviewWorkspace,
    aggregateId: `project-asset:${asset.id}`,
    sourceAssetId: asset.assetId,
    history: [],
    cursor: 0,
    advanced: {
      ...reviewWorkspace.advanced,
      webcam: createQuickEditWebcam(
        'project-asset:missing',
        reviewWorkspace.source,
        reviewWorkspace.source
      ),
    },
  });
  if (!workspace) throw new Error('Invalid nested review fixture.');
  rows.privateReviews = [{ workspace, draft: null }];
  await expect(encodeCapturedVideoReviewRoot(rows)).rejects.toThrow('Invalid frozen video review');
  expect(io.read).not.toHaveBeenCalled();
});

it.each([false, true])(
  'encodes each reachable nested sidecar and exact native original once (cycle=%s)',
  async (cycle) => {
    const { rows } = nestedMediaReviewFixture(cycle);
    const result = await encodeCapturedVideoReviewRoot(rows);
    const metadata = parsePortableMediaMetadata(result.envelope.metadata);
    expect(
      metadata.reviewAssets?.map((asset) => [
        asset.entry.id,
        asset.videoReview?.workspace.aggregateId,
      ])
    ).toEqual([
      ['b', 'project-asset:b'],
      ['c', 'project-asset:c'],
    ]);
    expect(metadata.reviewAssets?.[0]?.videoReview?.workspace.history).toHaveLength(1);
    expect(metadata.reviewAssets?.[1]?.videoReview?.draft?.annotation.text).toBe('Draft c');
    expect(result.bindings.map((binding) => binding.ref.assetId)).toEqual([
      'review-original-bytes',
      'b-bytes',
      'c-bytes',
    ]);
    expect(result.objects).toHaveLength(3);
    expect(io.read).toHaveBeenCalledTimes(3);
    const roots = await buildMediaRootInventory({
      db: backupDatabase(rows),
      items: [{ ...rows.source.media, hasThumbnail: false }],
      expectedReview: rows.review,
      options: createMediaHubBackupExportOptions({ includeWebSnapshots: false }),
      paths: createArchivePathAllocator(),
    });
    expect(result.envelope.metadata).toEqual(
      JSON.parse(JSON.stringify((await roots[0]!.load()).metadata))
    );
    expect(io.liveRead).not.toHaveBeenCalled();
  }
);

it('detaches nested sidecar history and recovery before asynchronous file reads', async () => {
  const { rows } = nestedMediaReviewFixture(true);
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  io.read.mockImplementationOnce(async (ref: AssetRef, filename: string) => {
    entered();
    await gate;
    return new File([new Uint8Array(ref.size)], filename, { type: ref.mimeType });
  });
  const pending = encodeCapturedVideoReviewRoot(rows);
  await started;
  rows.privateReviews[0]!.workspace.history = [];
  rows.privateReviews[1]!.draft!.annotation.text = 'Live nested edit';
  release();
  const metadata = parsePortableMediaMetadata((await pending).envelope.metadata);
  expect(metadata.reviewAssets?.[0]?.videoReview?.workspace.history).toHaveLength(1);
  expect(metadata.reviewAssets?.[1]?.videoReview?.draft?.annotation.text).toBe('Draft c');
});

it.each([false, true])(
  'encodes a frozen recording review through the existing backup carrier (archived=%s)',
  async (archived) => {
    const previous = reviewRows();
    const recording = {
      id: 'saved-recording',
      assetId: previous.source.ref.assetId,
      filename: 'Saved recording.webm',
      createdAt: 1,
      mimeType: previous.source.ref.mimeType,
      size: previous.source.ref.size,
      ...(previous.source.media.lifecycle ? { lifecycle: previous.source.media.lifecycle } : {}),
    };
    const media = {
      ...previous.source.media,
      kind: 'recording' as const,
      id: `recording:${recording.id}`,
      source: { kind: 'recording' as const, recordingId: recording.id },
    };
    const aggregateId = archived ? 'recording:quick-project:previous' : media.id;
    const rows: CapturedVideoReviewRows = {
      ...previous,
      source: { media, recording, ref: previous.source.ref, telemetry: null },
      review: {
        ...previous.review,
        workspace: {
          ...previous.review.workspace,
          aggregateId,
          ...(archived ? { sourceMediaId: media.id } : {}),
        },
        draft: previous.review.draft ? { ...previous.review.draft, aggregateId } : null,
      },
      ...(previous.thumbnail ? { thumbnail: { ...previous.thumbnail, assetId: aggregateId } } : {}),
    };
    const encoded = await encodeCapturedVideoReviewRoot(rows);
    const metadata = parsePortableMediaMetadata(encoded.envelope.metadata);
    expect(encoded.reviewSourceMediaId).toBe(media.id);
    expect(metadata.recording?.entry.id).toBe(aggregateId.slice('recording:'.length));
    expect(metadata.videoReview?.workspace.aggregateId).toBe(aggregateId);
    expect(encoded.bindings[0]?.ref).toEqual(rows.source.ref);
    expect(io.liveRead).not.toHaveBeenCalled();
  }
);
