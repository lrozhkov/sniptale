import { beforeEach, expect, it, vi } from 'vitest';
import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { importEffectBundleZip } from '../../../features/video/project/effect-bundle/import/zip';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { verifyVideoProjectEffectSnapshotIntegrity } from '../../../features/video/project/effect-instance';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { parseVideoProjectEntry } from '../projects/read-guards';
import type { AssetRef } from '../assets';
import type { PreparedVideoProjectReplicaRoot } from './prepared-project';
import {
  applyPreparedVideoProjectRevision,
  type ApplyPreparedVideoProjectRevisionInput,
} from './apply-video-project';

const io = vi.hoisted(() => ({ database: vi.fn(), read: vi.fn(), cleanup: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  readAssetFile: io.read,
  completePhysicalDeleteOperation: io.cleanup,
}));
beforeEach(() => {
  vi.clearAllMocks();
  io.cleanup.mockResolvedValue(undefined);
});

const projectId = 'binary-project';

async function setup(withEffects = true) {
  let failReceipt = false;
  let captureWrites = 0;
  const fixture = createReviewWorkspaceStoreFixture((name) => {
    if (name !== 'sync_capture') return false;
    captureWrites += 1;
    return failReceipt && captureWrites === 2;
  });
  const table = (name: string) => fixture.rows.get(name)!;
  io.database.mockResolvedValue(fixture.database);
  const transaction = vi.spyOn(fixture.database, 'transaction');
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'binary-space',
    connectionGeneration: 3,
  });
  table('project_assets').set('unrelated-source', {
    id: 'unrelated-source',
    assetId: 'unrelated-bytes',
    createdAt: 1,
    size: 1,
    mimeType: 'video/webm',
  });
  const files = new Map<string, File>();
  function stage(assetId: string, bytes: Uint8Array, mimeType: string): AssetRef {
    files.set(assetId, new File([Uint8Array.from(bytes).buffer], assetId, { type: mimeType }));
    return {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs', objectKey: `objects/${assetId}` },
      mimeType,
      size: bytes.byteLength,
      sha256: null,
    };
  }
  io.read.mockImplementation(async (ref: AssetRef) => {
    const file = files.get(ref.assetId);
    if (!file) throw new Error('Missing staged bytes');
    return file;
  });
  const project = { ...createEmptyVideoProject('Binary publication'), id: projectId };
  const root: PreparedVideoProjectReplicaRoot = {
    assets: [],
    entry: {
      id: projectId,
      project,
      createdAt: 1,
      updatedAt: 2,
      workspaceRevision: 400,
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2 },
    },
  };
  if (withEffects) {
    const corpus = EFFECT_BUNDLE_CORPUS.find(
      ({ accepted, artifact }) => accepted && artifact.includes('asset-bearing-conformance')
    );
    if (!corpus) throw new Error('Missing asset-bearing corpus');
    const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(corpus));
    if (!imported.ok) throw new Error('Expected accepted asset-bearing corpus');
    const document = imported.bundle.documents[0]!;
    const snapshotId = `effect:${document.sha256}`;
    root.entry.project.effectSnapshots = [
      {
        assets: document.assets.map((asset) => ({
          id: asset.id,
          byteLength: asset.byteLength,
          kind: asset.kind,
          mimeType: asset.mimeType,
          sha256: asset.sha256,
        })),
        documentId: document.document.id,
        id: snapshotId,
        kind: document.document.kind,
        retainedByteLength:
          new TextEncoder().encode(document.source).byteLength +
          document.assets.reduce((size, asset) => size + asset.byteLength, 0),
        schemaVersion: 'sniptale.effect.v1',
        sha256: document.sha256,
        source: document.source,
      },
    ];
    root.snapshotRefs = document.assets.map((asset, index) => ({
      snapshotId,
      assetId: asset.id,
      ref: stage(`effect-${index}`, asset.bytes, asset.mimeType),
    }));
  }
  const thumbnailRef = stage('thumbnail', new TextEncoder().encode('new-thumbnail'), 'image/png');
  const presentationRef = stage(
    'presentation',
    new TextEncoder().encode('new-presentation'),
    'image/png'
  );
  const previewRef = stage('preview', new TextEncoder().encode('new-preview'), 'image/png');
  root.thumbnail = {
    entry: {
      assetId: `video-project:${projectId}`,
      createdAt: 1,
      updatedAt: 1,
      width: 1,
      height: 1,
    },
    ref: thumbnailRef,
  };
  root.presentation = {
    entry: {
      aggregateId: projectId,
      aggregateKind: 'video-project',
      presentationRevision: 400,
      updatedAt: 1,
    },
    thumbnailRef: presentationRef,
    previewRef,
  };
  const input: ApplyPreparedVideoProjectRevisionInput = {
    root,
    operationId: 'accepted-binary-project',
    sourceDigest: 'a'.repeat(64),
    connectionGeneration: 3,
    spaceId: 'binary-space',
    profileCreatedAt: 1,
    expectedBasis: [],
    expectedLocalGeneration: 0,
    expectedWorkspaceRevision: null,
    dependencies: [],
  };
  return {
    ...fixture,
    table,
    files,
    input,
    transaction,
    failReceipt() {
      failReceipt = true;
      captureWrites = 0;
    },
    allowWrites() {
      failReceipt = false;
      captureWrites = 0;
    },
  };
}

it('rolls staged publication and receipt back on failure and applies one exact retry', async () => {
  const fixture = await setup(false);
  const before = structuredClone(fixture.rows);
  fixture.failReceipt();
  await expect(applyPreparedVideoProjectRevision(fixture.input)).rejects.toThrow('No space');
  expect(fixture.rows).toEqual(before);
  expect(io.cleanup).not.toHaveBeenCalled();
  fixture.allowWrites();
  await expect(applyPreparedVideoProjectRevision(fixture.input)).resolves.toEqual({
    status: 'applied',
    generation: 1,
  });
  expect(fixture.table('project_assets')).toEqual(before.get('project_assets'));
  expect(fixture.table('media_library')).toEqual(before.get('media_library'));
  expect(fixture.table('asset_refs')).toEqual(before.get('asset_refs'));
  expect(fixture.table('video_projects').get(projectId)).toMatchObject({ workspaceRevision: 1 });
  expect(fixture.table('thumbnails').get(`video-project:${projectId}`)).toMatchObject(
    fixture.input.root.thumbnail!.entry
  );
  const thumbnail = fixture.table('thumbnails').get(`video-project:${projectId}`);
  expect(thumbnail).toHaveProperty('blob');
  expect(fixture.table('aggregate_presentations').get(projectId)).toMatchObject({
    aggregateId: projectId,
    presentationRevision: 1,
  });
  const after = structuredClone(fixture.rows);
  await expect(applyPreparedVideoProjectRevision(fixture.input)).resolves.toEqual({
    status: 'duplicate',
    generation: 1,
  });
  expect(fixture.rows).toEqual(after);
});

it('publishes effect and sidecar Blobs independently of staging and replays receipts without byte IO', async () => {
  const fixture = await setup();
  const beforeSources = structuredClone(fixture.table('project_assets'));
  await expect(applyPreparedVideoProjectRevision(fixture.input)).resolves.toEqual({
    status: 'applied',
    generation: 1,
  });
  const entry = parseVideoProjectEntry(fixture.table('video_projects').get(projectId));
  if (!entry) throw new Error('Expected native project publication');
  expect(entry.workspaceRevision).toBe(1);
  expect(entry.project.effectSnapshots![0]!.assets.length).toBeGreaterThan(0);
  fixture.files.clear();
  await expect(verifyVideoProjectEffectSnapshotIntegrity(entry.project)).resolves.toBeUndefined();
  const presentation = fixture.table('aggregate_presentations').get(projectId);
  expect(presentation).toMatchObject({
    presentationRevision: 1,
    thumbnailBlob: expect.any(Blob),
    previewBlob: expect.any(Blob),
  });
  const after = structuredClone(fixture.rows);
  io.read.mockRejectedValue(new Error('Staging is gone'));
  io.read.mockClear();
  await expect(applyPreparedVideoProjectRevision(fixture.input)).resolves.toEqual({
    status: 'duplicate',
    generation: 1,
  });
  expect(io.read).not.toHaveBeenCalled();
  expect(fixture.rows).toEqual(after);
  expect(fixture.table('project_assets')).toEqual(beforeSources);
});

it('refuses a stale second writer after a later binary project revision commits', async () => {
  const fixture = await setup();
  await applyPreparedVideoProjectRevision(fixture.input);
  const next = structuredClone(fixture.input);
  next.operationId = 'second-binary-revision';
  next.expectedLocalGeneration = 1;
  next.expectedWorkspaceRevision = 1;
  next.expectedBasis = [fixture.input.operationId];
  next.root.entry.project.name = 'Accepted later editor state';
  const delayed = structuredClone(next);
  delayed.operationId = 'delayed-stale-writer';
  delayed.root.entry.project.name = 'Stale editor state';
  await expect(applyPreparedVideoProjectRevision(next)).resolves.toEqual({
    status: 'applied',
    generation: 2,
  });
  const before = structuredClone(fixture.rows);
  await expect(applyPreparedVideoProjectRevision(delayed)).rejects.toMatchObject({
    code: 'project-changed',
  });
  expect(fixture.rows).toEqual(before);
  expect(fixture.table('video_projects').get(projectId)).toMatchObject({
    workspaceRevision: 2,
    project: { name: next.root.entry.project.name },
  });
});

it.each(['missing', 'corrupt'] as const)(
  'refuses %s effect bytes before opening a native write transaction',
  async (change) => {
    const fixture = await setup();
    const ref = fixture.input.root.snapshotRefs![0]!.ref;
    if (change === 'missing') fixture.files.delete(ref.assetId);
    else
      fixture.files.set(
        ref.assetId,
        new File([new Uint8Array(ref.size)], 'corrupt', { type: ref.mimeType })
      );
    const before = structuredClone(fixture.rows);
    await expect(applyPreparedVideoProjectRevision(fixture.input)).rejects.toThrow();
    expect(fixture.transaction.mock.calls.some(([, mode]) => mode === 'readwrite')).toBe(false);
    expect(fixture.rows).toEqual(before);
    expect(io.cleanup).not.toHaveBeenCalled();
  }
);
