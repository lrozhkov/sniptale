import {
  encodeEditorImageHistorySnapshot,
  IMAGE_HISTORY_VALUE_TOKEN_PREFIX,
} from '../../../../features/editor-history/image-snapshot';
import type { EditorImageHistoryValue } from '../../../../features/editor-history/image-checkpoint';
import type { PersistedImageHistory } from '../../../../composition/persistence/image-workspaces/history-contracts';
import type { AssetRef } from '../../../../composition/persistence/assets';
import { exportMediaHubBackupV6, buildMediaHubBackupExportPlanV6 } from '../export';
import { inspectMediaHubBackupV6 } from '../inspect';
import { createArchiveMemorySink } from '../../../../composition/archive-transfer/test-support';
import { putRecordingBackupRestore } from '../../../../composition/persistence/recordings/backup-restore';
import { assertPortableJson, parseRootEnvelope } from '../codec';
import { parsePortableMediaMetadata } from '../root-codecs/media';
import { expect, it, vi } from 'vitest';
import { PAGE_PACKAGE_ARCHIVE_MIME_TYPE } from '@sniptale/runtime-contracts/page-package';

const mocks = vi.hoisted(() => ({ readFile: vi.fn(), sanitizeSnapshot: vi.fn() }));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  readAssetFile: mocks.readFile,
}));
vi.mock('../../../../features/web-snapshot/provenance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/web-snapshot/provenance')>()),
  sanitizeWebSnapshotPackageProvenance: mocks.sanitizeSnapshot,
}));

import { createPersistedEditorDocumentFixture } from '../../../../composition/persistence/document-assets/test-support';
import { createLibraryLifecycle } from '../../../../composition/persistence/library-lifecycle/contracts';
import { createEditorDocumentFixture } from '../../../../editor/document/page-session/document.test-support';
import type {
  MediaLibraryEntry,
  MediaLibraryItem,
} from '../../../../composition/persistence/media-library/contracts';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import { createCleanupWebSnapshotRecord } from '../../../media-hub/cleanup.test-support';
import { createPagePackageManifestFixture as createWebSnapshotManifest } from '../../../../features/web-snapshot/manifest.test-support';
import { buildMediaRootInventory } from './media';
import { createMediaHubBackupExportOptions } from '../options';
import { createArchivePathAllocator } from '../../../../composition/archive-transfer';
import { workspace as reviewWorkspace } from '../../../../composition/persistence/review-workspaces/backup-restore.test-support';
import { parseVideoWorkspace } from '../../../../composition/persistence/review-workspaces/parser';
import type { VideoWorkspaceSnapshot } from '../../../../composition/persistence/review-workspaces/contracts';

function mediaEntry(overrides: Partial<MediaLibraryEntry> = {}): MediaLibraryEntry {
  return {
    blob: new Blob(['image'], { type: 'image/png' }),
    createdAt: 1,
    duration: null,
    filename: 'capture.png',
    height: 80,
    id: 'media-one',
    kind: 'screenshot',
    mimeType: 'image/png',
    originalFilename: 'capture.png',
    size: 5,
    source: { kind: 'screenshot' },
    sourceFavicon: 'https://example.com/favicon.png',
    sourceTitle: 'Private title',
    sourceUrl: 'https://example.com/private',
    tags: [],
    updatedAt: 2,
    width: 100,
    workspaceRevision: 1,
    ...overrides,
  };
}

function item(entry: ReturnType<typeof mediaEntry>): MediaLibraryItem {
  const { blob: _blob, ...metadata } = entry;
  return { ...metadata, hasThumbnail: false } satisfies MediaLibraryItem;
}

function ref(assetId: string) {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType: 'image/png',
    sha256: null,
    size: 6,
  };
}

it.each(['screenshot', 'project-asset', 'different-project-bytes', 'temporary-original'] as const)(
  'archives independent Image projects and validates the exact retained original (%s)',
  async (sourceKind) => {
    const projectAsset =
      sourceKind === 'project-asset'
        ? {
            id: 'original',
            assetId: 'original-bytes',
            createdAt: 1,
            mimeType: 'image/png',
            size: 5,
          }
        : null;
    const original = mediaEntry({
      id: projectAsset ? 'project-asset:original' : 'original',
      ...(projectAsset
        ? {
            kind: 'image',
            source: { kind: 'project-asset', projectAssetId: projectAsset.id },
          }
        : {}),
      lifecycle: createLibraryLifecycle('library', 1),
      savedIndependently: false,
      originalSaveId: crypto.randomUUID(),
    });
    const unattached = mediaEntry({
      id: 'unattached',
      lifecycle: createLibraryLifecycle('library', 1),
      savedIndependently: false,
    });
    const imageProjects = ['first', 'second'].map((id) => ({
      aggregateId: id,
      sourceMediaId: original.id,
      createdAt: 1,
      updatedAt: 2,
      revision: 1,
      sourceTitle: null,
      sourceUrl: null,
      document: {
        ...createPersistedEditorDocumentFixture(createEditorDocumentFixture()),
        displayName: id,
      },
      lifecycle: createLibraryLifecycle('library', 1),
    }));
    const workspaces = new Map(imageProjects.map((project) => [project.aggregateId, project]));
    mocks.readFile.mockImplementation(
      async (_ref, filename) => new File(['image'], filename, { type: 'image/png' })
    );
    const db = {
      transaction: emptyReviewTransaction,
      get: async (store: string, id: string) => {
        if (store === 'media_library') return id === original.id ? original : unattached;
        if (store === 'project_assets' && id === projectAsset?.id) return projectAsset;
        if (store === 'image_workspaces') return workspaces.get(id);
        if (store === 'asset_refs') return { ...ref(id), size: 5 };
        return undefined;
      },
    };
    const options = createMediaHubBackupExportOptions({ scope: 'all' });
    const roots = await buildMediaRootInventory({
      db,
      items: [item(original), item(unattached)],
      options,
      paths: createArchivePathAllocator(),
      imageProjects,
      includeLibraryRelationships: true,
      requiredMediaIds: new Set([original.id]),
    });
    expect(roots.map((root) => root.descriptor.rootId)).toEqual([original.id, 'first', 'second']);
    const metadata = await Promise.all(
      roots.map(async (root) =>
        parsePortableMediaMetadata((await root.load()).metadata, {
          allowLibraryRelationships: true,
        })
      )
    );
    expect(metadata[0]).toMatchObject({ savedIndependently: false });
    expect(metadata[0]?.entry).not.toHaveProperty('originalSaveId');
    expect(metadata.slice(1).map((project) => project.linkedSourceMediaId)).toEqual([
      original.id,
      original.id,
    ]);
    if (sourceKind === 'different-project-bytes') {
      const project = roots[1]!;
      const payload = await project.load();
      roots[1] = {
        ...project,
        load: async () => ({
          metadata: payload.metadata,
          objects: payload.objects.map((object) =>
            object.ref.objectId === metadata[1]?.originalObjectId
              ? { ref: object.ref, blob: new Blob(['other'], { type: 'image/png' }) }
              : object
          ),
        }),
      };
    }
    if (sourceKind === 'temporary-original') {
      const source = roots[0]!;
      const payload = await source.load();
      const temporary = {
        ...metadata[0]!,
        entry: { ...metadata[0]!.entry, lifecycle: createLibraryLifecycle('temporary', 1) },
      };
      assertPortableJson(temporary);
      roots[0] = { ...source, load: async () => ({ ...payload, metadata: temporary }) };
    }
    const memory = createArchiveMemorySink();
    await exportMediaHubBackupV6({
      plan: buildMediaHubBackupExportPlanV6({
        layout: 'library-folders-v3',
        privacy: { includeSourceMetadata: true, includeTelemetry: true, includeWebSnapshots: true },
        roots,
      }),
      sink: memory.sink,
    });
    const admitted = inspectMediaHubBackupV6(memory.blob());
    if (sourceKind === 'different-project-bytes') {
      await expect(admitted).rejects.toThrow('different original bytes');
      return;
    }
    if (sourceKind === 'temporary-original') {
      await expect(admitted).rejects.toThrow(
        'Archived project original must be saved in the Library'
      );
      return;
    }
    const inspection = await admitted;
    expect(inspection.manifest.layout).toBe('library-folders-v7');
    expect(
      inspection.manifest.sharedObjects?.filter(({ mimeType }) => mimeType === 'image/png')
    ).toHaveLength(1);
  }
);

it.each([true, false])(
  'backs up selected export without parent, explicit MIME=%s',
  async (explicitMime) => {
    const entry = mediaEntry({
      id: 'export:selected',
      kind: 'export',
      mimeType: 'video/webm',
      source: { kind: 'project-export', exportId: 'selected', projectId: 'not-selected' },
      filename: 'result.webm',
      originalFilename: 'result.webm',
      duration: 1,
      size: 6,
    });
    const review = {
      aggregateId: entry.id,
      formatVersion: 1,
      sourceAssetId: 'video-object',
      source: { duration: 1, width: 100, height: 80, size: 6, mimeType: 'video/webm' },
      revision: 1,
      cursor: 0,
      history: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const db = {
      transaction: () => ({
        objectStore: (store: string) => ({
          index: () => ({ getAll: async () => [] }),
          get: async () => (store === 'video_workspaces' ? review : undefined),
        }),
        done: Promise.resolve(),
      }),
      get: vi.fn(async (store: string) => {
        if (store === 'media_library') return entry;
        if (store === 'project_exports')
          return {
            id: 'selected',
            projectId: 'not-selected',
            assetId: 'video-object',
            filename: 'result.webm',
            createdAt: 1,
            duration: 1,
            width: 100,
            height: 80,
            fps: 30,
            size: 6,
            ...(explicitMime ? { mimeType: 'video/webm' } : {}),
          };
        if (store === 'asset_refs') return { ...ref('video-object'), mimeType: 'video/webm' };
        return undefined;
      }),
    };
    mocks.readFile.mockResolvedValue(new File(['video!'], 'result.webm', { type: 'video/webm' }));
    const roots = await buildMediaRootInventory({
      db,
      items: [item(entry)],
      options: createMediaHubBackupExportOptions({
        scope: 'selected',
        selected: {
          mediaAssetIds: [entry.id],
          scenarioProjectIds: [],
          videoProjectIds: [],
        },
      }),
      paths: createArchivePathAllocator(),
    });
    expect(roots).toHaveLength(1);
    expect(roots[0]?.descriptor.rootKind).toBe('media');
    expect(roots[0]?.descriptor.rootId).toBe('export:selected');
    const payload = await roots[0]!.load();
    const portable = parsePortableMediaMetadata(payload.metadata);
    expect(portable.videoReview?.workspace.aggregateId).toBe(entry.id);
    expect(portable.videoReview?.workspace.history).toEqual([]);
  }
);

it('excludes drafts by default and places included drafts in readable folders', async () => {
  const entry = mediaEntry({
    id: 'draft-image',
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 2 },
  });
  const db = { transaction: emptyReviewTransaction, get: vi.fn(async () => entry) };
  await expect(
    buildMediaRootInventory({
      db,
      items: [item(entry)],
      options: createMediaHubBackupExportOptions(),
      paths: createArchivePathAllocator(),
    })
  ).resolves.toEqual([]);
  const [root] = await buildMediaRootInventory({
    db,
    items: [item(entry)],
    options: createMediaHubBackupExportOptions({ includeDrafts: true }),
    paths: createArchivePathAllocator(),
  });
  expect(root?.summary.draftCount).toBe(1);
  await expect(root?.load()).resolves.toMatchObject({
    objects: [{ ref: { path: 'Drafts/Screenshots/capture.png' } }],
  });
});

it.each<MediaLibraryEntry['source']>([
  { kind: 'screenshot' },
  { kind: 'stored-asset', assetId: 'workspace-source' },
  { kind: 'project-asset', projectAssetId: 'imported-image' },
])(
  'exports $kind image, presentation and editor dependencies as separate files',
  async (source) => {
    const entry = mediaEntry({ source });
    if (source.kind !== 'screenshot') delete entry.blob;
    if (source.kind === 'project-asset') entry.id = `project-asset:${source.projectAssetId}`;
    const document = createPersistedEditorDocumentFixture(
      createEditorDocumentFixture(),
      'workspace-source'
    );
    const db = {
      transaction: emptyReviewTransaction,
      get: vi.fn(async (store: string) => {
        if (store === 'media_library') return entry;
        if (store === 'image_workspaces') {
          return {
            aggregateId: entry.id,
            createdAt: 1,
            document,
            revision: 1,
            sourceTitle: 'Private workspace',
            sourceUrl: 'https://example.com/workspace',
            updatedAt: 2,
          };
        }
        if (store === 'asset_refs') return ref('workspace-source');
        if (store === 'project_assets' && source.kind === 'project-asset')
          return {
            id: source.projectAssetId,
            assetId: 'workspace-source',
            createdAt: 1,
            size: 6,
            mimeType: 'image/png',
          };
        if (store === 'aggregate_presentations') {
          return {
            aggregateId: entry.id,
            aggregateKind: 'image',
            presentationRevision: 1,
            previewBlob: new Blob(['preview'], { type: 'image/png' }),
            thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
            updatedAt: 2,
          };
        }
        return undefined;
      }),
    };
    mocks.readFile.mockResolvedValue(
      new File(['source'], 'workspace-source.png', { type: 'image/png' })
    );
    const roots = await buildMediaRootInventory({
      db,
      items: [item(entry)],
      options: createMediaHubBackupExportOptions({ includeSourceMetadata: false }),
      paths: createArchivePathAllocator(),
    });
    expect(roots).toHaveLength(1);
    expect(roots[0]?.descriptor).toMatchObject({
      objectCount: 4,
      totalBytes: source.kind === 'screenshot' ? 23 : 24,
    });
    const payload = await roots[0]!.load();
    expect(payload.objects).toHaveLength(4);
    expect(payload.objects.map((object) => object.ref.path)).toContain('Screenshots/capture.png');
    expect(
      payload.objects.filter((object) => object.ref.path.startsWith('_sniptale/assets/'))
    ).toHaveLength(3);
    expect(payload.metadata).toMatchObject({
      entry: { sourceTitle: null, sourceUrl: null },
      presentation: expect.objectContaining({ thumbnailObjectId: expect.any(String) }),
      workspace: {
        document: expect.objectContaining({ sourceImage: { objectId: expect.any(String) } }),
        sourceTitle: null,
        sourceUrl: null,
      },
    });
    assertPortableJson(payload.metadata);
    const portableWorkspace = parsePortableMediaMetadata(payload.metadata).workspace;
    expect(JSON.stringify(portableWorkspace)).not.toContain('assetId');
    expect(JSON.stringify(portableWorkspace)).not.toContain('workspace-source');
  }
);

it.each(['video/webm', 'video/webm; codecs="vp8, opus"'])(
  'exports recording bytes through OPFS File and telemetry only when requested: %s',
  async (mimeType) => {
    const entry = mediaEntry({
      duration: 3,
      filename: 'recording.webm',
      height: 720,
      id: 'recording:recording-one',
      kind: 'video',
      mimeType,
      size: 5,
      source: { kind: 'recording', recordingId: 'recording-one' },
      width: 1280,
    });
    const actions: RecordingTelemetryEntry['actionEvents'] = [
      {
        id: 'captured-click',
        kind: 'CLICK',
        time: 1,
        duration: 0.4,
        preset: 'CLICK_RIPPLE',
        label: 'Click',
        point: { x: 0.5, y: 0.5 },
        data: {
          targetKind: 'button',
          targetSource: 'html',
          targetTag: 'button',
          targetName: 'Save',
        },
      },
    ];
    const db = {
      transaction: emptyReviewTransaction,
      get: vi.fn(async (store: string) => {
        if (store === 'media_library') return entry;
        if (store === 'recordings') {
          return {
            assetId: 'recording-asset',
            createdAt: 1,
            filename: 'recording.webm',
            id: 'recording-one',
            mimeType,
            size: 5,
          };
        }
        if (store === 'asset_refs') return { ...ref('recording-asset'), mimeType, size: 5 };
        if (store === 'recording_telemetry') {
          return {
            actionEvents: actions,
            captureMode: null,
            createdAt: 1,
            cursorTrack: null,
            recordingId: 'recording-one',
            signals: [],
            updatedAt: 1,
            viewport: null,
          } satisfies RecordingTelemetryEntry;
        }
        return undefined;
      }),
    };
    const file = new File(['media'], 'recording.webm', { type: mimeType });
    mocks.readFile.mockResolvedValue(file);
    const [root] = await buildMediaRootInventory({
      db,
      items: [item(entry)],
      options: createMediaHubBackupExportOptions({ includeTelemetry: true }),
      paths: createArchivePathAllocator(),
    });
    const payload = await root!.load();
    expect(payload.objects[0]?.ref.path).toBe('Recordings/recording.webm');
    expect(() =>
      parseRootEnvelope({
        descriptor: root!.descriptor,
        metadata: payload.metadata,
        objects: payload.objects.map((object) => object.ref),
      })
    ).not.toThrow();
    expect(payload.objects[0]!.ref.mimeType).toBe('video/webm');
    expect(payload.objects[0]!.blob).toBe(file);
    expect(file.type).toBe(mimeType);
    expect(payload.metadata).toMatchObject({
      recording: {
        entry: { id: 'recording-one' },
        telemetry: { recordingId: 'recording-one' },
      },
    });
    expect(JSON.stringify(payload.metadata)).not.toContain('recording-asset');
    const restored = parsePortableMediaMetadata(JSON.parse(JSON.stringify(payload.metadata)));
    expect(restored.recording?.telemetry?.actionEvents).toEqual(actions);
    const recording = restored.recording!;
    const telemetryStore = { put: vi.fn(async () => undefined) };
    const discard = { put: async () => undefined };
    await putRecordingBackupRestore({
      entry: { ...recording.entry, assetId: 'restored-asset' },
      ref: {
        ...ref('restored-asset'),
        location: { kind: 'opfs', objectKey: 'objects/restored-asset' },
        mimeType,
        size: 5,
      },
      refStore: discard,
      ownerStore: discard,
      recordingStore: discard,
      telemetry: recording.telemetry!,
      telemetryStore,
    });
    expect(telemetryStore.put).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingId: 'recording-one',
        actionEvents: actions,
      })
    );
  }
);

it('places durable audio in the readable Audio directory', async () => {
  const entry = mediaEntry({
    filename: 'voice note.webm',
    id: 'audio-media',
    kind: 'audio',
    mimeType: 'audio/webm',
  });
  const [root] = await buildMediaRootInventory({
    db: { transaction: emptyReviewTransaction, get: vi.fn(async () => entry) },
    items: [item(entry)],
    options: createMediaHubBackupExportOptions(),
    paths: createArchivePathAllocator(),
  });
  await expect(root?.load()).resolves.toMatchObject({
    objects: [{ ref: { path: 'Audio/voice note.webm' } }],
  });
});

it('uses the sanitized snapshot manifest in outer metadata when provenance is disabled', async () => {
  const entry = mediaEntry({
    filename: 'Private title.png',
    id: 'snapshot',
    source: { kind: 'web-snapshot', snapshotId: 'snapshot' },
  });
  const stored = createCleanupWebSnapshotRecord('snapshot');
  stored.manifest = createWebSnapshotManifest({
    id: 'snapshot',
    source: {
      faviconUrl: 'https://example.com/favicon.ico?token=secret',
      title: 'Private title',
      url: 'https://user:pass@example.com/private?token=secret',
    },
  });
  const sanitizedManifest = {
    ...stored.manifest,
    source: { faviconUrl: null, title: null, url: null },
  };
  mocks.sanitizeSnapshot.mockResolvedValue({
    changed: true,
    manifest: sanitizedManifest,
    packageBlob: new Blob(['safe-package'], { type: PAGE_PACKAGE_ARCHIVE_MIME_TYPE }),
    size: 12,
  });
  mocks.readFile
    .mockResolvedValueOnce(
      new File(['package'], 'snapshot.zip', { type: PAGE_PACKAGE_ARCHIVE_MIME_TYPE })
    )
    .mockResolvedValueOnce(new File(['image'], 'snapshot.png', { type: 'image/png' }));
  const db = {
    transaction: emptyReviewTransaction,
    get: vi.fn(async (store: string, key: unknown) => {
      if (store === 'media_library') return entry;
      if (store === 'web_snapshots') return stored;
      if (store === 'asset_refs' && typeof key === 'string') return ref(key);
      return undefined;
    }),
  };

  const [root] = await buildMediaRootInventory({
    db,
    items: [item(entry)],
    options: createMediaHubBackupExportOptions({
      includeSourceMetadata: false,
      includeWebSnapshots: true,
    }),
    paths: createArchivePathAllocator(),
  });
  const payload = await root!.load();
  const packageObject = payload.objects.find((object) =>
    object.ref.path.endsWith('.sniptale-page-package.zip')
  );

  expect(payload.objects.map((object) => object.ref.path)).toEqual([
    'Web snapshots/Snapshot/snapshot.sniptale-page-package.zip',
    'Web snapshots/Snapshot/screenshot.png',
  ]);

  expect(payload.metadata).toMatchObject({
    entry: { size: 12 },
    originalObjectId: packageObject?.ref.objectId,
    webSnapshot: { entry: { manifest: { source: sanitizedManifest.source }, size: 12 } },
  });
  expect(JSON.stringify(payload.metadata)).not.toContain('Private title');
  expect(JSON.stringify(payload.metadata)).not.toContain('token=secret');
  expect(payload.objects.map((object) => object.ref.path).join('\n')).not.toContain(
    'Private title'
  );
});

function emptyReviewTransaction() {
  return {
    objectStore: () => ({
      index: () => ({ getAll: async () => [] }),
      get: async () => undefined,
    }),
    done: Promise.resolve(),
  };
}

function archivedReviewInventoryFixture() {
  const { blob: _blob, ...source } = mediaEntry({
    id: 'project-asset:actual-source',
    kind: 'video',
    source: { kind: 'project-asset', projectAssetId: 'actual-source' },
    filename: 'source.webm',
    originalFilename: 'source.webm',
    mimeType: 'video/webm',
    size: 6,
  });
  const aggregateId = 'project-asset:quick-project:previous';
  const workspace = parseVideoWorkspace({
    ...reviewWorkspace,
    aggregateId,
    sourceMediaId: source.id,
    sourceAssetId: 'source-object',
    formatVersion: 3,
    project: {
      name: 'Independent saved review',
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
    },
  });
  if (!workspace) throw new Error('Invalid archived review fixture.');
  const snapshot: VideoWorkspaceSnapshot = { workspace, draft: null };
  const get = vi.fn(async (store: string, key: unknown): Promise<unknown> => {
    if (store === 'media_library' && key === source.id) return source;
    if (store === 'project_assets' && key === 'actual-source')
      return {
        id: 'actual-source',
        assetId: 'source-object',
        createdAt: 1,
        mimeType: 'video/webm',
        size: 6,
      };
    if (store === 'asset_refs' && key === 'source-object')
      return { ...ref('source-object'), mimeType: 'video/webm' };
    return undefined;
  });
  const db = {
    get,
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: (store: string) => ({
        get: async (id: string) =>
          id !== aggregateId
            ? undefined
            : store === 'video_workspaces'
              ? snapshot.workspace
              : (snapshot.draft ?? undefined),
        index: () => ({ getAll: async () => [] }),
      }),
    })),
  };
  const inventory = (expectedReview: VideoWorkspaceSnapshot = snapshot, linked = false) =>
    buildMediaRootInventory({
      db,
      items: [item(source)],
      reviewWorkspaceHeads: [{ aggregateId, sourceMediaId: source.id }],
      expectedReview,
      ...(linked ? { includeLibraryRelationships: true } : {}),
      options: createMediaHubBackupExportOptions({
        scope: 'selected',
        selected: {
          mediaAssetIds: linked ? [source.id, aggregateId] : [aggregateId],
          videoProjectIds: [],
          scenarioProjectIds: [],
        },
      }),
      paths: createArchivePathAllocator(),
    });
  return { snapshot, source, aggregateId, db, inventory };
}

it('keeps an archived Quick Edit project and its original as separate portable roots', async () => {
  const fixture = archivedReviewInventoryFixture();
  mocks.readFile.mockResolvedValue(new File(['video!'], 'source.webm', { type: 'video/webm' }));
  const roots = await fixture.inventory(fixture.snapshot, true);
  expect(roots.map(({ descriptor }) => descriptor.rootId)).toEqual([
    fixture.source.id,
    fixture.aggregateId,
  ]);
  const [source, project] = await Promise.all(
    roots.map(async (root) =>
      parsePortableMediaMetadata((await root.load()).metadata, {
        allowLibraryRelationships: true,
      })
    )
  );
  expect(source).not.toHaveProperty('videoReview');
  expect(project).toMatchObject({
    linkedSourceMediaId: fixture.source.id,
    videoReview: { workspace: { project: { name: 'Independent saved review' } } },
  });
});

it('reads archived review and recovery from the supplied database without a native alias row', async () => {
  const fixture = archivedReviewInventoryFixture();
  fixture.snapshot.draft = {
    aggregateId: fixture.aggregateId,
    revision: fixture.snapshot.workspace.revision,
    annotation: { id: 'draft', text: 'Recovery', anchor: { kind: 'point', time: 1 } },
    before: null,
    updatedAt: 4,
  };
  mocks.readFile.mockResolvedValue(new File(['video!'], 'source.webm', { type: 'video/webm' }));
  const roots = await fixture.inventory();
  expect(roots).toHaveLength(1);
  const portable = parsePortableMediaMetadata((await roots[0]!.load()).metadata);
  expect(portable.entry.id).toBe(fixture.aggregateId);
  expect(portable.videoReview?.workspace.project?.name).toBe('Independent saved review');
  expect(portable.videoReview?.draft).toEqual(fixture.snapshot.draft);
  expect(fixture.db.transaction).toHaveBeenCalledWith(
    ['video_workspaces', 'video_workspace_history', 'video_workspace_drafts'],
    'readonly'
  );
  expect(fixture.db.get.mock.calls.filter(([store]) => store === 'media_library')).toEqual([
    ['media_library', fixture.source.id],
  ]);
});

it('refuses an archived source or recovery association that differs in the supplied database', async () => {
  const sourceChanged = archivedReviewInventoryFixture();
  sourceChanged.snapshot.workspace.sourceAssetId = 'replaced-source-object';
  mocks.readFile.mockResolvedValue(new File(['video!'], 'source.webm', { type: 'video/webm' }));
  await expect(sourceChanged.inventory()).rejects.toThrow(
    'Video review source is missing or changed'
  );
  const draftChanged = archivedReviewInventoryFixture();
  draftChanged.snapshot.draft = {
    aggregateId: 'project-asset:another-review',
    revision: 1,
    annotation: { id: 'draft', text: 'Wrong owner', anchor: { kind: 'point', time: 1 } },
    before: null,
    updatedAt: 4,
  };
  await expect(draftChanged.inventory()).rejects.toThrow('Quick project changed before backup');
});

it('retains the expected archived snapshot check after supplied database admission', async () => {
  const fixture = archivedReviewInventoryFixture();
  const expected = structuredClone(fixture.snapshot);
  expected.workspace.project!.name = 'Earlier project name';
  mocks.readFile.mockResolvedValue(new File(['video!'], 'source.webm', { type: 'video/webm' }));
  await expect(fixture.inventory(expected)).rejects.toThrow('Video review changed before backup');
});

it('projects an unloaded stored image ref without reading a body or lending the inline original', async () => {
  const { blob: _blob, ...entry } = mediaEntry({
    source: { kind: 'stored-asset', assetId: 'unloaded' },
    size: 6,
  });
  const native = {
    ...ref('unloaded'),
    location: { kind: 'opfs' as const, objectKey: 'objects/unloaded' },
  };
  const onObject = vi.fn();
  mocks.readFile.mockClear();
  const roots = await buildMediaRootInventory({
    db: {
      transaction: emptyReviewTransaction,
      get: async (store, key) =>
        store === 'media_library'
          ? entry
          : store === 'asset_refs' && key === native.assetId
            ? native
            : undefined,
    },
    items: [item(entry)],
    options: createMediaHubBackupExportOptions(),
    paths: createArchivePathAllocator(),
    deferredAssets: { refs: new Map([[native.assetId, native]]), onObject },
  });
  const loaded = await roots[0]!.load();
  const portable = parsePortableMediaMetadata(loaded.metadata);
  expect(loaded.objects).toEqual([]);
  expect(roots[0]!.descriptor).toMatchObject({ objectCount: 1, totalBytes: 6 });
  expect(onObject).toHaveBeenCalledExactlyOnceWith(
    native.assetId,
    expect.objectContaining({ objectId: portable.originalObjectId, size: 6 })
  );
  expect(mocks.readFile).not.toHaveBeenCalled();
});

it('shares media export eligibility with metadata-only Library preparation without reading files', async () => {
  const { isMediaBackupItemSelected } = await import('./media');
  const options = createMediaHubBackupExportOptions({
    includeDrafts: false,
    includeWebSnapshots: false,
    scope: 'selected',
    selected: {
      mediaAssetIds: ['included', 'snapshot', 'draft'],
      scenarioProjectIds: [],
      videoProjectIds: [],
    },
  });
  const before = mocks.readFile.mock.calls.length;
  expect(
    isMediaBackupItemSelected({ id: 'included', source: { kind: 'stored-asset' } }, options)
  ).toBe(true);
  expect(
    isMediaBackupItemSelected({ id: 'other', source: { kind: 'stored-asset' } }, options)
  ).toBe(false);
  expect(
    isMediaBackupItemSelected({ id: 'snapshot', source: { kind: 'web-snapshot' } }, options)
  ).toBe(false);
  expect(
    isMediaBackupItemSelected(
      { id: 'draft', source: { kind: 'stored-asset' }, lifecycle: { storageClass: 'temporary' } },
      options
    )
  ).toBe(false);
  expect(mocks.readFile.mock.calls.length).toBe(before);
});

it('exports Image past/current/future with portable IDs, shared bitmaps and historical privacy', async () => {
  const source = 'data:image/png;base64,' + 'QUJD'.repeat(2100);
  const base = { ...createEditorDocumentFixture(), sourceImageData: source };
  const units: EditorImageHistoryValue[] = [];
  const ids = new Map<string, string>();
  const documents = [0, 1, 2].map((index) => ({
    ...base,
    displayName: `Caption ${index}`,
    frame: {
      ...base.frame,
      browserTitle: 'Private past title',
      browserUrl: 'https://private.test/path?token=secret',
    },
  }));
  const files = new Map<string, Blob>();
  const snapshots = documents.map((document, index) => {
    const value = encodeEditorImageHistorySnapshot(
      document,
      {
        intern(value, kind) {
          const found = ids.get(value);
          if (found) return found;
          const id = IMAGE_HISTORY_VALUE_TOKEN_PREFIX + ids.size;
          ids.set(value, id);
          units.push({ id, kind, value });
          return id;
        },
      },
      new Set()
    );
    const assetId = `snapshot-${index}`;
    files.set(assetId, new Blob([value], { type: 'application/json' }));
    return { assetId };
  });
  const values = units.map((unit): PersistedImageHistory['values'][number] => {
    const assetId = unit.kind === 'image' ? 'shared-source' : `unit-${unit.id}`;
    if (unit.kind === 'json') {
      files.set(assetId, new Blob([unit.value], { type: 'application/json' }));
      return { id: unit.id, kind: 'json', assetId };
    }
    files.set(
      assetId,
      new Blob(
        [
          Uint8Array.from(atob(unit.value.slice(unit.value.indexOf(',') + 1)), (character) =>
            character.charCodeAt(0)
          ),
        ],
        { type: 'image/png' }
      )
    );
    return {
      id: unit.id,
      kind: 'image',
      assetId,
      dataUrl: { header: 'data:image/png;base64,', lastCharacter: 'D', padding: 0 },
    };
  });
  const history: PersistedImageHistory = {
    version: 1,
    epoch: 'archive-history',
    cursor: 1,
    snapshots,
    values,
    actions: [null, { operation: 'rename', target: null }, { operation: 'rename', target: null }],
  };
  const refs = new Map<string, AssetRef>(
    [...files].map(([assetId, file]) => [
      assetId,
      {
        assetId,
        createdAt: 1,
        mimeType: file.type,
        size: file.size,
        sha256: null,
        location: { kind: 'opfs', objectKey: `objects/${assetId}` },
      },
    ])
  );
  const entry = mediaEntry({
    blob: files.get('shared-source')!,
    size: files.get('shared-source')!.size,
  });
  const workspace = {
    aggregateId: entry.id,
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
    document: {
      ...createPersistedEditorDocumentFixture(documents[1]!, 'shared-source'),
      displayName: documents[1]!.displayName,
    },
    history,
    publicationId: 'native-only-receipt',
    sourceTitle: null,
    sourceUrl: null,
  };
  mocks.readFile.mockClear();
  mocks.readFile.mockImplementation(async (ref: AssetRef, name: string) => {
    const file = files.get(ref.assetId);
    if (!file) throw new Error('Missing test resource');
    return new File([file], name, { type: file.type });
  });
  const roots = await buildMediaRootInventory({
    db: {
      transaction: emptyReviewTransaction,
      get: async (store: string, id: unknown) =>
        store === 'media_library'
          ? entry
          : store === 'image_workspaces'
            ? workspace
            : store === 'asset_refs' && typeof id === 'string'
              ? refs.get(id)
              : undefined,
    },
    items: [item(entry)],
    options: createMediaHubBackupExportOptions({ includeSourceMetadata: false }),
    paths: createArchivePathAllocator(),
  });
  const payload = await roots[0]!.load();
  const portable = parsePortableMediaMetadata(payload.metadata);
  expect(portable.workspace?.history).toMatchObject({
    epoch: 'archive-history',
    cursor: 1,
    snapshots: expect.any(Array),
  });
  expect(portable.workspace?.history?.snapshots).toHaveLength(3);
  expect(JSON.stringify(portable.workspace)).not.toContain('assetId');
  expect(JSON.stringify(portable.workspace)).not.toContain('native-only-receipt');
  expect(portable.workspace?.history?.values[0]?.objectId).toBe(
    portable.workspace?.document.sourceImage.objectId
  );
  expect(mocks.readFile.mock.calls.filter(([ref]) => ref.assetId === 'shared-source')).toHaveLength(
    1
  );
  for (const object of payload.objects)
    if (object.blob?.type === 'application/json') {
      const text = await object.blob.text();
      expect(text).not.toContain('Private past title');
      expect(text).not.toContain('private.test');
    }
  const memory = createArchiveMemorySink();
  const plan = buildMediaHubBackupExportPlanV6({
    layout: 'library-folders-v3',
    roots,
    privacy: { includeSourceMetadata: false, includeTelemetry: true, includeWebSnapshots: true },
  });
  await exportMediaHubBackupV6({ plan, sink: memory.sink });
  const inspected = await inspectMediaHubBackupV6(
    new File([memory.blob()], 'history.zip', { type: 'application/zip' })
  );
  expect(inspected.manifest.layout).toBe('library-folders-v6');
});
