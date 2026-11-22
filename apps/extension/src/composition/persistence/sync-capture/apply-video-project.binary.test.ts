import { beforeEach, expect, it, vi } from 'vitest';
import { readValidAnimationSnapshot } from '../effect-bundles/fixture.test-support';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { verifyVideoProjectEffectSnapshotIntegrity } from '../../../features/video/project/effect-instance';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { parseVideoProjectEntry } from '../projects/read-guards';
import type { AssetRef } from '../assets';
import { createSha256Digest } from '@sniptale/platform/security/digest';
import {
  createVideoProjectHistoryChange,
  applyVideoProjectHistoryChangeValues,
} from '../../../features/video/project/history-change';
import { getVideoProjectWorkspace } from '../projects';
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
  if (withEffects) root.entry.project.effectSnapshots = [await readValidAnimationSnapshot()];
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

it('publishes complete history atomically and reopens it after a late receipt refusal and retry', async () => {
  const fixture = await setup(false);
  const current = fixture.input.root.entry.project;
  const anchor = { ...current, name: 'Anchor' };
  const refs: AssetRef[] = [];
  const inverse = async (before: typeof current, after: typeof current, assetId: string) => {
    const value = JSON.stringify(createVideoProjectHistoryChange(before, after));
    const file = new File([value], assetId, { type: 'application/json' });
    fixture.files.set(assetId, file);
    refs.push({
      assetId,
      createdAt: 1,
      size: file.size,
      mimeType: file.type,
      location: { kind: 'opfs', objectKey: `objects/${assetId}` },
      sha256: (await createSha256Digest(value)).slice('sha256:'.length),
    });
    return { assetId };
  };
  fixture.input.root.history = {
    head: {
      version: 1,
      epoch: 'received-history',
      sources: [],
      past: [await inverse({ ...current, name: 'Before' }, anchor, 'history-past')],
      future: [await inverse({ ...current, name: 'After' }, anchor, 'history-future')],
      recovery: await inverse(anchor, current, 'history-recovery'),
    },
    refs,
  };
  const before = structuredClone(fixture.rows);
  fixture.failReceipt();
  await expect(applyPreparedVideoProjectRevision(fixture.input)).rejects.toThrow('No space');
  expect(fixture.rows).toEqual(before);
  expect(io.cleanup).not.toHaveBeenCalled();
  fixture.allowWrites();
  await expect(applyPreparedVideoProjectRevision(fixture.input)).resolves.toMatchObject({
    status: 'applied',
  });
  for (const ref of refs) {
    expect(fixture.table('asset_refs').get(ref.assetId)).toEqual(ref);
    expect([...fixture.table('asset_owners').values()]).toContainEqual({
      assetId: ref.assetId,
      ownerKind: 'video-project-history',
      ownerId: projectId,
      role: `history:change:${ref.assetId}`,
    });
  }
  const opened = await getVideoProjectWorkspace(projectId);
  if (opened.status !== 'ready' || opened.history.status !== 'ready')
    throw new Error('Expected canonical native history');
  const recoveredAnchor = applyVideoProjectHistoryChangeValues(
    opened.project,
    opened.history.value.recovery!.change
  );
  expect(recoveredAnchor.name).toBe('Anchor');
  expect(
    applyVideoProjectHistoryChangeValues(recoveredAnchor, opened.history.value.past[0]!.change).name
  ).toBe('Before');
  expect(
    applyVideoProjectHistoryChangeValues(recoveredAnchor, opened.history.value.future[0]!.change)
      .name
  ).toBe('After');
  const published = structuredClone(fixture.rows);
  io.read.mockClear();
  fixture.files.clear();
  await expect(applyPreparedVideoProjectRevision(fixture.input)).resolves.toMatchObject({
    status: 'duplicate',
  });
  expect(fixture.rows).toEqual(published);
  expect(io.read).not.toHaveBeenCalled();
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
  expect(entry.project.effectSnapshots![0]!.source).toBe(
    fixture.input.root.entry.project.effectSnapshots![0]!.source
  );
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
    const snapshot = fixture.input.root.entry.project.effectSnapshots![0]!;
    if (change === 'missing') snapshot.source = '{}';
    else snapshot.sha256 = '0'.repeat(64);
    const before = structuredClone(fixture.rows);
    await expect(applyPreparedVideoProjectRevision(fixture.input)).rejects.toThrow();
    expect(fixture.transaction.mock.calls.some(([, mode]) => mode === 'readwrite')).toBe(false);
    expect(fixture.rows).toEqual(before);
    expect(io.cleanup).not.toHaveBeenCalled();
  }
);
