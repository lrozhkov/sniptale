import { buildRecordingMediaEntry } from '../media-library/entry-mapping';
import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { importEffectBundleZip } from '../../../features/video/project/effect-bundle/import/zip';
import { verifyVideoProjectEffectSnapshotIntegrity } from '../../../features/video/project/effect-instance';
import { createQuickEditWebcam } from '../../../features/video/review/advanced/webcam';
import { workspace as reviewWorkspace } from '../review-workspaces/backup-restore.test-support';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { parseVideoProjectEntry } from '../projects/read-guards';
import type { VideoWorkspace } from '../review-workspaces/contracts';
import { collectCapturedProjectEditingMediaIds } from './project-snapshot';
import { expect, it, vi } from 'vitest';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
  createProjectExportEntry,
  createVideoProjectEntryWithMediaClip,
  createVideoProjectRestoreTransaction,
} from '../projects/index.test-support';
import type { AssetRef } from '../assets/contracts';
import {
  freezeVideoProjectInTransaction,
  freezeMediaInTransaction,
  digestCapturedMediaRows,
  UnsupportedSyncCaptureGraphError,
} from './freeze';

function memoryStore() {
  const rows = new Map<string, unknown>();
  const key = (value: IDBValidKey) => JSON.stringify(value);
  return {
    rows,
    seed(id: IDBValidKey, value: unknown) {
      rows.set(key(id), value);
    },
    get: vi.fn(async (id: IDBValidKey) => rows.get(key(id))),
    getAll: vi.fn(async () => {
      throw new Error('Global enumeration is outside the freezer contract.');
    }),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    index: vi.fn((name: string) => ({
      getAll: vi.fn(async (id: IDBValidKey, count?: number) =>
        [...rows.values()]
          .filter(
            (row) =>
              typeof row === 'object' &&
              row !== null &&
              name in row &&
              Reflect.get(row, name) === id
          )
          .slice(0, count)
      ),
      getAllKeys: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    })),
  };
}

function reference(assetId: string, mimeType: string, size: number): AssetRef {
  return {
    assetId,
    createdAt: 10,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType,
    size,
    sha256: null,
  };
}

function fixture() {
  const stores = {
    assets: memoryStore(),
    exports: memoryStore(),
    media: memoryStore(),
    videoWorkspaces: memoryStore(),
    videoDrafts: memoryStore(),
    operations: memoryStore(),
    owners: memoryStore(),
    presentations: memoryStore(),
    projects: memoryStore(),
    refs: memoryStore(),
    thumbnails: memoryStore(),
    scenarioAssets: memoryStore(),
  };
  const project = createVideoProjectEntryWithMediaClip();
  const source = project.project.assets[0]!;
  if (source.source.kind !== 'project-asset')
    throw new Error('Fixture source must be a project asset.');
  const asset = createProjectAssetEntry({
    id: source.source.projectAssetId,
    originMediaId: 'original-1',
    mimeType: source.metadata.mimeType,
    size: source.metadata.size,
  });
  const exported = createProjectExportEntry({ projectId: project.id });
  const mirror = createMediaLibraryEntry({
    id: `project-asset:${asset.id}`,
    kind: 'video',
    source: { kind: 'project-asset', projectAssetId: asset.id },
    mimeType: asset.mimeType,
    size: asset.size,
  });
  const original = createMediaLibraryEntry({
    id: 'original-1',
    source: { kind: 'stored-asset', assetId: 'original-bytes' },
    size: 7,
  });
  const exportMirror = createMediaLibraryEntry({
    id: `export:${exported.id}`,
    kind: 'export',
    source: { kind: 'project-export', exportId: exported.id, projectId: project.id },
    mimeType: exported.mimeType!,
    size: exported.size,
  });
  stores.projects.seed(project.id, project);
  stores.assets.seed(asset.id, asset);
  stores.exports.seed(exported.id, exported);
  for (const row of [mirror, original, exportMirror]) stores.media.seed(row.id, row);
  for (const ref of [
    reference(asset.assetId, asset.mimeType, asset.size),
    reference(exported.assetId, exported.mimeType!, exported.size),
    reference('original-bytes', original.mimeType, original.size),
  ])
    stores.refs.seed(ref.assetId, ref);
  const tx = createVideoProjectRestoreTransaction(stores);
  return { stores, project, asset, exported, mirror, original, exportMirror, tx };
}

it('freezes exact native rows and the origin media dependency without reading another database', async () => {
  const data = fixture();
  const rawProject = { ...data.project, usageReferenceKeys: ['owner-index-value'] };
  data.stores.projects.seed(data.project.id, rawProject);
  const rows = await freezeVideoProjectInTransaction(data.tx, data.project.id);
  expect(rows.project).toEqual(rawProject);
  expect(rows.assets).toEqual([data.asset]);
  expect(rows.exports).toEqual([data.exported]);
  expect(rows.media).toEqual(
    expect.arrayContaining([data.mirror, data.original, data.exportMirror])
  );
  expect(rows.media).toHaveLength(3);
  expect(new Set(rows.refs.map((row) => row.assetId))).toEqual(
    new Set(['asset-object-1', 'export-object-1', 'original-bytes'])
  );
  rawProject.project.name = 'Changed after capture';
  data.asset.originMediaId = 'replacement';
  expect(rows.project.project.name).not.toBe(rawProject.project.name);
  expect(rows.assets[0]?.originMediaId).toBe('original-1');
  for (const store of Object.values(data.stores)) {
    expect(store.getAll).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  }
});

it('captures a borrowed stored media source and its physical ref once', async () => {
  const data = fixture();
  const source = data.project.project.assets[0]!;
  const borrowed = {
    ...source,
    type: 'IMAGE' as const,
    id: 'borrowed-placement',
    source: { kind: 'library-asset' as const, mediaId: data.original.id },
    metadata: { ...source.metadata, mimeType: data.original.mimeType, size: data.original.size },
  };
  data.project.project.assets.push(borrowed);
  const rows = await freezeVideoProjectInTransaction(data.tx, data.project.id);
  expect(rows.project.project.assets).toHaveLength(2);
  expect(rows.media.filter((row) => row.id === data.original.id)).toHaveLength(1);
  expect(rows.refs.filter((row) => row.assetId === 'original-bytes')).toHaveLength(1);
});

it('refuses a missing dependency rather than dropping it from the snapshot', async () => {
  const data = fixture();
  data.stores.media.rows.delete(JSON.stringify(data.original.id));
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

it('refuses source descriptor and physical ref disagreements', async () => {
  const data = fixture();
  data.stores.refs.seed(
    data.asset.assetId,
    reference(data.asset.assetId, data.asset.mimeType, data.asset.size + 1)
  );
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

it('refuses a mismatched published mirror instead of silently changing backup metadata', async () => {
  const data = fixture();
  data.stores.media.seed(data.mirror.id, {
    ...data.mirror,
    source: { kind: 'stored-asset', assetId: 'original-bytes' },
  });
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

it.each(['review', 'draft', 'thumbnail', 'presentation'] as const)(
  'refuses an unsupported %s sidecar in the captured graph',
  async (kind) => {
    const data = fixture();
    if (kind === 'review')
      data.stores.videoWorkspaces.seed(data.mirror.id, { aggregateId: data.mirror.id });
    if (kind === 'draft')
      data.stores.videoDrafts.seed(data.mirror.id, { aggregateId: data.mirror.id });
    if (kind === 'thumbnail')
      data.stores.thumbnails.seed(`video-project:${data.project.id}`, {
        blob: new Blob(['thumbnail']),
      });
    if (kind === 'presentation')
      data.stores.presentations.seed(['video-project', data.project.id], {
        aggregateId: data.project.id,
      });
    await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toBeInstanceOf(
      UnsupportedSyncCaptureGraphError
    );
  }
);

it('refuses orphan review history even when its workspace head is absent', async () => {
  const data = fixture();
  const tx = new Proxy(data.tx, {
    get(target, property) {
      if (property !== 'objectStore') return Reflect.get(target, property);
      return (name: string) =>
        name === 'video_workspace_history'
          ? { index: () => ({ getAllKeys: async () => ['orphan-history'] }) }
          : target.objectStore(name);
    },
  });
  await expect(freezeVideoProjectInTransaction(tx, data.project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

it('refuses a recording graph before looking up its unsupported dependency stores', async () => {
  const data = fixture();
  data.project.project.source = { kind: 'recording', recordingId: 'recording-1' };
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
  expect(data.stores.assets.get).not.toHaveBeenCalled();
});

it('refuses a malformed saved export rather than omitting it as ordinary backup listing can', async () => {
  const data = fixture();
  data.stores.exports.seed('malformed', { id: 'malformed', projectId: data.project.id });
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

it('refuses legacy inline media bytes in an otherwise supported graph', async () => {
  const data = fixture();
  data.stores.media.seed(data.original.id, { ...data.original, blob: new Blob(['private bytes']) });
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

it('does not inspect unrelated roots or sidecars', async () => {
  const data = fixture();
  data.stores.projects.seed('unrelated', { unsupported: true });
  data.stores.videoWorkspaces.seed('unrelated', { unsupported: true });
  data.stores.media.seed('unrelated', { blob: new Blob(['unrelated']) });
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).resolves.toHaveProperty(
    'project.id',
    data.project.id
  );
});

function originalOnlyMediaFixture() {
  const data = fixture();
  const { originMediaId: _origin, ...asset } = data.asset;
  data.stores.assets.seed(asset.id, asset);
  return { ...data, asset };
}

it('freezes one original-only media publication without reading unrelated roots', async () => {
  const data = originalOnlyMediaFixture();
  const rows = await freezeMediaInTransaction(data.tx, data.mirror.id);
  expect(rows).toMatchObject({
    media: data.mirror,
    projectAsset: data.asset,
    ref: { assetId: data.asset.assetId, size: data.asset.size, mimeType: data.asset.mimeType },
  });
  expect(data.stores.projects.get).not.toHaveBeenCalled();
  expect(data.stores.exports.get).not.toHaveBeenCalled();
  for (const store of Object.values(data.stores)) expect(store.getAll).not.toHaveBeenCalled();
});

it('hashes normalized native media facts and detects metadata or local ref changes', async () => {
  const data = originalOnlyMediaFixture();
  const rows = await freezeMediaInTransaction(data.tx, data.mirror.id);
  const digest = digestCapturedMediaRows(rows);
  expect(digest).toMatch(/^[a-f0-9]{64}$/u);
  if (!('projectAsset' in rows)) throw new Error('Expected project source');
  const reordered = { ref: rows.ref, projectAsset: rows.projectAsset, media: rows.media };
  expect(digestCapturedMediaRows(reordered)).toBe(digest);
  expect(
    digestCapturedMediaRows({ ...rows, media: { ...rows.media, tags: ['changed'] } })
  ).not.toBe(digest);
  expect(
    digestCapturedMediaRows({ ...rows, ref: { ...rows.ref, sha256: 'a'.repeat(64) } })
  ).not.toBe(digest);
});

function derivedThumbnail(assetId: string) {
  return {
    assetId,
    blob: new Blob(['derived-preview'], { type: 'image/png' }),
    createdAt: 1,
    updatedAt: 2,
    width: 64,
    height: 36,
    generatorVersion: 1,
  };
}

it('keeps derived source thumbnails outside the authored project snapshot', async () => {
  const data = fixture();
  const before = await freezeVideoProjectInTransaction(data.tx, data.project.id);
  for (const media of [data.mirror, data.original]) {
    data.stores.thumbnails.seed(media.id, derivedThumbnail(media.id));
  }
  const after = await freezeVideoProjectInTransaction(data.tx, data.project.id);
  expect(after).toEqual(before);
  expect(await data.stores.thumbnails.get(data.mirror.id)).toEqual(
    derivedThumbnail(data.mirror.id)
  );
  expect(data.stores.thumbnails.delete).not.toHaveBeenCalled();
  expect(data.stores.thumbnails.put).not.toHaveBeenCalled();
});

it('keeps a derived media thumbnail outside the publication digest', async () => {
  const data = originalOnlyMediaFixture();
  const before = await freezeMediaInTransaction(data.tx, data.mirror.id);
  data.stores.thumbnails.seed(data.mirror.id, derivedThumbnail(data.mirror.id));
  const after = await freezeMediaInTransaction(data.tx, data.mirror.id);
  expect(after).toEqual(before);
  expect(digestCapturedMediaRows(after)).toBe(digestCapturedMediaRows(before));
  expect(await data.stores.thumbnails.get(data.mirror.id)).toEqual(
    derivedThumbnail(data.mirror.id)
  );
  expect(data.stores.thumbnails.delete).not.toHaveBeenCalled();
});

it('refuses a derived thumbnail stored under another media identity', async () => {
  const data = fixture();
  data.stores.thumbnails.seed(data.mirror.id, derivedThumbnail('another-media'));
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

it('refuses media sidecars and origin relations that have no bounded publication owner', async () => {
  const unsupported = fixture();
  await expect(
    freezeMediaInTransaction(unsupported.tx, unsupported.mirror.id)
  ).rejects.toBeInstanceOf(UnsupportedSyncCaptureGraphError);
  const data = originalOnlyMediaFixture();
  data.stores.thumbnails.seed(data.mirror.id, { blob: new Blob(['preview']) });
  await expect(freezeMediaInTransaction(data.tx, data.mirror.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

function privateReview(
  aggregateId: string,
  sourceAssetId: string,
  supplementaryId: string,
  source: { size: number; mimeType: string }
): VideoWorkspace {
  const workspace: VideoWorkspace = {
    ...reviewWorkspace,
    aggregateId,
    sourceAssetId,
    source: { ...reviewWorkspace.source, size: source.size, mimeType: source.mimeType },
    history: [],
    cursor: 0,
    advanced: {
      ...reviewWorkspace.advanced,
      webcam: createQuickEditWebcam(
        `project-asset:${supplementaryId}`,
        reviewWorkspace.source,
        reviewWorkspace.source
      ),
    },
  };
  const parsed = parseVideoWorkspace(workspace);
  if (!parsed) throw new Error('Expected valid native private review fixture');
  return parsed;
}

function seedSupplementary(data: ReturnType<typeof fixture>, id: string, originMediaId?: string) {
  const entry = createProjectAssetEntry({
    id,
    assetId: `${id}-bytes`,
    mimeType: 'video/webm',
    size: 6,
    ...(originMediaId ? { originMediaId } : {}),
  });
  data.stores.assets.seed(id, entry);
  data.stores.refs.seed(entry.assetId, reference(entry.assetId, entry.mimeType, entry.size));
  if (originMediaId) {
    const media = createMediaLibraryEntry({
      id: originMediaId,
      source: { kind: 'stored-asset', assetId: `${originMediaId}-bytes` },
      mimeType: entry.mimeType,
      size: entry.size,
    });
    data.stores.media.seed(media.id, media);
    data.stores.refs.seed(
      `${originMediaId}-bytes`,
      reference(`${originMediaId}-bytes`, media.mimeType, media.size)
    );
  }
  return entry;
}

it('freezes recursive private source reviews and their supplementary children without enumeration', async () => {
  const data = fixture();
  data.stores.media.rows.delete(JSON.stringify(data.mirror.id));
  const child = seedSupplementary(data, 'review-camera');
  const nested = seedSupplementary(data, 'nested-camera');
  const sourceReview = privateReview(data.mirror.id, data.asset.assetId, child.id, data.asset);
  const childReview = privateReview(`project-asset:${child.id}`, child.assetId, nested.id, child);
  data.stores.videoWorkspaces.seed(sourceReview.aggregateId, sourceReview);
  data.stores.videoWorkspaces.seed(childReview.aggregateId, childReview);
  const rows = await freezeVideoProjectInTransaction(data.tx, data.project.id);
  expect(new Set(rows.assets.map((asset) => asset.id))).toEqual(
    new Set([data.asset.id, child.id, nested.id])
  );
  expect(rows.reviews).toEqual(
    expect.arrayContaining([
      { workspace: sourceReview, draft: null },
      { workspace: childReview, draft: null },
    ])
  );
  expect(rows.reviews).toHaveLength(2);
  expect(rows.refs).toEqual(
    expect.arrayContaining([
      reference(child.assetId, child.mimeType, child.size),
      reference(nested.assetId, nested.mimeType, nested.size),
    ])
  );
  sourceReview.advanced.webcam!.assetId = 'project-asset:later-camera';
  expect(rows.reviews![0]!.workspace.advanced.webcam!.assetId).toBe(`project-asset:${child.id}`);
  for (const store of Object.values(data.stores)) {
    expect(store.getAll).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  }
});

it('freezes project thumbnail and presentation preview bytes as independent retained sidecars', async () => {
  const data = fixture();
  const thumbnail = {
    assetId: `video-project:${data.project.id}`,
    blob: new Blob(['project-thumbnail'], { type: 'image/png' }),
    createdAt: 1,
    updatedAt: 2,
    width: 64,
    height: 36,
  };
  const presentation = {
    aggregateId: data.project.id,
    aggregateKind: 'video-project' as const,
    presentationRevision: data.project.workspaceRevision ?? 0,
    updatedAt: 2,
    thumbnailBlob: new Blob(['presentation-thumbnail'], { type: 'image/png' }),
    previewBlob: new Blob(['presentation-preview'], { type: 'image/png' }),
  };
  data.stores.thumbnails.seed(thumbnail.assetId, thumbnail);
  data.stores.presentations.seed(['video-project', data.project.id], presentation);
  const rows = await freezeVideoProjectInTransaction(data.tx, data.project.id);
  expect(rows.thumbnails).toEqual([thumbnail]);
  expect(rows.presentation).toEqual(presentation);
  thumbnail.blob = new Blob(['new-thumbnail']);
  presentation.previewBlob = new Blob(['new-preview']);
  data.stores.thumbnails.rows.clear();
  data.stores.presentations.rows.clear();
  expect(await rows.thumbnails![0]!.blob.text()).toBe('project-thumbnail');
  expect(await rows.presentation!.thumbnailBlob.text()).toBe('presentation-thumbnail');
  expect(await rows.presentation!.previewBlob!.text()).toBe('presentation-preview');
});

it('freezes an immutable native effect snapshot from the asset-bearing corpus', async () => {
  const data = fixture();
  const corpus = EFFECT_BUNDLE_CORPUS.find(
    ({ accepted, artifact }) => accepted && artifact.includes('asset-bearing-conformance')
  );
  if (!corpus) throw new Error('Expected asset-bearing corpus fixture');
  const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(corpus));
  if (!imported.ok) throw new Error('Expected accepted asset-bearing effect corpus');
  const document = imported.bundle.documents[0]!;
  const snapshot = {
    assets: document.assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      mimeType: asset.mimeType,
      byteLength: asset.byteLength,
      sha256: asset.sha256,
      blob: new Blob([Uint8Array.from(asset.bytes).buffer], { type: asset.mimeType }),
    })),
    documentId: document.document.id,
    id: `effect:${document.sha256}`,
    kind: document.document.kind,
    retainedByteLength:
      new TextEncoder().encode(document.source).byteLength +
      document.assets.reduce((sum, asset) => sum + asset.byteLength, 0),
    schemaVersion: 'sniptale.effect.v1' as const,
    sha256: document.sha256,
    source: document.source,
  };
  data.project.project.effectSnapshots = [snapshot];
  expect(parseVideoProjectEntry(data.project)).not.toBeNull();
  const rows = await freezeVideoProjectInTransaction(data.tx, data.project.id);
  expect(rows.project.project.effectSnapshots![0]!.assets.length).toBeGreaterThan(0);
  snapshot.source = '{}';
  snapshot.assets[0]!.blob = new Blob(['changed-after-freeze']);
  snapshot.assets.length = 0;
  data.stores.projects.rows.clear();
  expect(parseVideoProjectEntry(rows.project)).not.toBeNull();
  await expect(
    verifyVideoProjectEffectSnapshotIntegrity(rows.project.project)
  ).resolves.toBeUndefined();
});

it('retains export-only review assets outside editing dependencies', async () => {
  const data = fixture();
  data.stores.media.rows.delete(JSON.stringify(data.exportMirror.id));
  const child = seedSupplementary(data, 'export-camera', 'export-camera-origin');
  const nested = seedSupplementary(data, 'export-nested-camera', 'export-nested-origin');
  const exportedReview = privateReview(data.exportMirror.id, data.exported.assetId, child.id, {
    size: data.exported.size,
    mimeType: data.exported.mimeType!,
  });
  const nestedReview = privateReview(`project-asset:${child.id}`, child.assetId, nested.id, child);
  data.stores.videoWorkspaces.seed(exportedReview.aggregateId, exportedReview);
  data.stores.videoWorkspaces.seed(nestedReview.aggregateId, nestedReview);
  const rows = await freezeVideoProjectInTransaction(data.tx, data.project.id);
  expect(rows.assets).toEqual(expect.arrayContaining([child, nested]));
  expect(rows.media).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'export-camera-origin' }),
      expect.objectContaining({ id: 'export-nested-origin' }),
    ])
  );
  expect(rows.reviews).toHaveLength(2);
  const editing = collectCapturedProjectEditingMediaIds(rows);
  expect(editing).toEqual(new Set([data.original.id, data.mirror.id]));
  expect(editing.has('export-camera-origin')).toBe(false);
  expect(editing.has('export-nested-origin')).toBe(false);
});

function recordingSourceFixture() {
  const data = fixture();
  const recordings = memoryStore();
  const telemetry = memoryStore();
  const recording = {
    id: 'saved',
    assetId: 'saved-bytes',
    filename: 'Saved.webm',
    createdAt: 1,
    size: 6,
    mimeType: 'video/webm',
  };
  const media = buildRecordingMediaEntry(recording);
  recordings.seed(recording.id, recording);
  data.stores.media.seed(media.id, media);
  data.stores.refs.seed(
    recording.assetId,
    reference(recording.assetId, recording.mimeType, recording.size)
  );
  const owner = {
    ownerKind: 'recording',
    ownerId: recording.id,
    role: 'body',
    assetId: recording.assetId,
  };
  data.stores.owners.seed(['recording', recording.id, 'body'], owner);
  const tx = new Proxy(data.tx, {
    get(target, property) {
      if (property !== 'objectStore') return Reflect.get(target, property);
      return (name: string) =>
        name === 'recordings'
          ? recordings
          : name === 'recording_telemetry'
            ? telemetry
            : target.objectStore(name);
    },
  });
  return { ...data, recording, media, recordings, telemetry, owner, tx };
}

it('freezes a canonical recording source and absent telemetry using only the caller transaction', async () => {
  const data = recordingSourceFixture();
  const rows = await freezeMediaInTransaction(data.tx, data.media.id);
  expect(rows).toMatchObject({
    media: { id: data.media.id },
    recording: data.recording,
    telemetry: null,
  });
  data.recording.filename = 'Later.webm';
  expect('recording' in rows && rows.recording.filename).toBe('Saved.webm');
  expect(data.stores.assets.get).not.toHaveBeenCalled();
  expect(data.recordings.put).not.toHaveBeenCalled();
});

it('refuses missing or foreign recording ownership and malformed telemetry before capture', async () => {
  const data = recordingSourceFixture();
  data.stores.owners.seed(['recording', data.recording.id, 'body'], {
    ...data.owner,
    ownerId: 'foreign',
  });
  await expect(freezeMediaInTransaction(data.tx, data.media.id)).rejects.toThrow();
  data.stores.owners.seed(['recording', data.recording.id, 'body'], data.owner);
  data.telemetry.seed(data.recording.id, { recordingId: data.recording.id });
  await expect(freezeMediaInTransaction(data.tx, data.media.id)).rejects.toThrow();
  data.telemetry.rows.clear();
  data.recordings.seed(data.recording.id, { ...data.recording, id: 'foreign' });
  await expect(freezeMediaInTransaction(data.tx, data.media.id)).rejects.toThrow();
});

it('retains the independent review option for a saved recording and validates its immutable source', async () => {
  const data = recordingSourceFixture();
  data.stores.videoWorkspaces.seed(data.media.id, {
    ...structuredClone(reviewWorkspace),
    aggregateId: data.media.id,
    sourceAssetId: data.recording.assetId,
    source: {
      ...reviewWorkspace.source,
      size: data.recording.size,
      mimeType: 'video/webm; codecs="vp8"',
    },
    history: [],
    cursor: 0,
  });
  await expect(freezeMediaInTransaction(data.tx, data.media.id)).rejects.toThrow();
  await expect(
    freezeMediaInTransaction(data.tx, data.media.id, { allowIndependentReview: true })
  ).resolves.toMatchObject({ recording: data.recording });
  data.stores.refs.seed(
    data.recording.assetId,
    reference(data.recording.assetId, data.recording.mimeType, 7)
  );
  await expect(
    freezeMediaInTransaction(data.tx, data.media.id, { allowIndependentReview: true })
  ).rejects.toThrow();
});

it('ignores a derived recording thumbnail before any review workspace exists', async () => {
  const data = recordingSourceFixture();
  data.stores.thumbnails.seed(data.media.id, {
    assetId: data.media.id,
    blob: new Blob(['generated-frame'], { type: 'image/webp' }),
    createdAt: data.recording.createdAt,
    generatorVersion: 2,
    height: 180,
    updatedAt: 2,
    width: 320,
  });
  const rows = await freezeMediaInTransaction(data.tx, data.media.id, {
    allowIndependentReview: true,
  });
  expect(rows).toMatchObject({ recording: data.recording, telemetry: null });
  expect(rows).not.toHaveProperty('thumbnail');
  expect(data.stores.videoWorkspaces.rows.size).toBe(0);
  await expect(freezeMediaInTransaction(data.tx, data.media.id)).resolves.toEqual(rows);
});
