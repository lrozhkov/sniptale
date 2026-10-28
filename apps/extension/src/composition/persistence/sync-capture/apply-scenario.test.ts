import { createScenarioReplicaFixture } from './test-support/scenario-replica.test-support';
import { beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createGuideProject, createGuideStep } from '../../../features/scenario/project/factories';
import { createScenarioProjectEntry } from '../scenario/projects/entry';
import { createVideoProjectEntryWithMediaClip } from '../projects/index.test-support';
import { createVideoProjectAsset } from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import type { AssetRef, AssetReadyJournal } from '../assets';
import { applyCatalogDeletionNative, type ApplyCatalogDeletionInput } from './apply-deletion';
import { parseSyncCaptureRecord, hashCaptureText } from './guards';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { createMediaLibraryEntry } from '../projects/index.test-support';
import { loadScenarioReplicaPredecessorAssets } from './apply-scenario';
import { captureRootKey } from './contracts';
import { applyPreparedScenarioReplica } from './apply-scenario';

const io = vi.hoisted(() => ({
  database: vi.fn(),
  mutate: vi.fn(),
  read: vi.fn(),
  journals: vi.fn(),
  cleanup: vi.fn(),
  busy: false,
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: (effect: unknown) => io.mutate(effect),
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  readAssetFile: io.read,
  listReadyJournals: io.journals,
  recoverStandaloneAssetPublications: vi.fn(async () => 0),
  completePhysicalDeleteOperation: io.cleanup,
}));
vi.mock('../assets/resource-sessions', async (original) => ({
  ...(await original<typeof import('../assets/resource-sessions')>()),
  tryAssetResourceCleanup: async (operation: () => Promise<unknown>) =>
    io.busy ? undefined : operation(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  io.busy = false;
  io.journals.mockResolvedValue([]);
  io.cleanup.mockResolvedValue(undefined);
});

function setup() {
  const data = createScenarioReplicaFixture();
  io.database.mockResolvedValue(data.database);
  io.mutate.mockImplementation(data.mutate);
  io.read.mockImplementation(
    async (ref: { size: number; mimeType: string }) =>
      new File([new Uint8Array(ref.size)], 'metadata', { type: ref.mimeType })
  );
  return data;
}

it('publishes native Scenario content and replays its durable receipt without an outgoing echo', async () => {
  const f = setup();
  expect(await applyPreparedScenarioReplica(f.input)).toMatchObject({
    status: 'applied',
    generation: 1,
  });
  expect((await f.current())?.project.name).toBe('Remote guide');
  expect((await f.current())?.workspaceRevision).toBeGreaterThan(
    f.input.root.entry.workspaceRevision
  );
  expect(await applyPreparedScenarioReplica(f.input)).toMatchObject({
    status: 'duplicate',
    generation: 1,
  });
  expect(
    [...f.fixture.rows.get('sync_capture')!.values()].filter(
      (value) => isRecord(value) && value['kind'] === 'sync-operation'
    )
  ).toHaveLength(0);
});

it.each(['temporary', 'step-template'] as const)(
  'preserves a %s Scenario prerequisite during native sync publication',
  async (kind) => {
    const f = setup();
    if (kind === 'temporary')
      f.input.root.entry.lifecycle = { storageClass: 'temporary', savedAt: null, updatedAt: 1 };
    else {
      f.input.root.entry.project.purpose = 'step-template';
      f.input.root.entry.project.items = [createGuideStep('Template source', 'template-step')];
    }
    expect(await applyPreparedScenarioReplica(f.input)).toMatchObject({
      status: 'applied',
      generation: 1,
    });
    const current = await f.current();
    if (kind === 'temporary') expect(current?.lifecycle).toEqual(f.input.root.entry.lifecycle);
    expect(current?.project.purpose).toEqual(f.input.root.entry.project.purpose);
  }
);

async function withDependentMontage() {
  const f = setup();
  const child = {
    id: 'required-child',
    projectId: f.input.root.entry.id,
    assetId: 'required-child-bytes',
    mimeType: 'image/png',
    size: 3,
    width: 10,
    height: 10,
    createdAt: 1,
    galleryAssetId: null,
  };
  const ref: AssetRef = {
    assetId: child.assetId,
    createdAt: 1,
    mimeType: child.mimeType,
    size: child.size,
    sha256: null,
    location: { kind: 'opfs', objectKey: `objects/${child.assetId}` },
  };
  f.input.root.assets = [{ entry: child, ref }];
  await applyPreparedScenarioReplica(f.input);
  const current = (await f.current())!;
  const montage = createVideoProjectEntryWithMediaClip({ id: 'dependent-montage' });
  const asset = createVideoProjectAsset(
    'Required Scenario image',
    VideoProjectAssetType.IMAGE,
    { kind: 'scenario-asset', scenarioAssetId: child.id },
    {
      audioPeaks: null,
      duration: 0,
      hasAudio: false,
      mimeType: child.mimeType,
      size: child.size,
      width: child.width,
      height: child.height,
    }
  );
  montage.project.assets = [asset];
  montage.project.clips = [
    createVideoClipFromAsset(
      montage.project.tracks[0]!.id,
      asset,
      montage.project.width,
      montage.project.height
    ),
  ];
  montage.project.source = { kind: 'scenario', scenarioProjectId: child.projectId };
  f.fixture.rows.get('video_projects')!.set(montage.id, montage);
  const next = structuredClone(f.input);
  next.operationId = 'scenario-rename';
  next.sourceDigest = 'b'.repeat(64);
  next.expectedLocalGeneration = 1;
  next.expectedBasis = [f.input.operationId];
  next.expectedWorkspaceRevision = current.workspaceRevision;
  next.root.entry.project.name = 'Renamed Scenario';
  return { ...f, child, ref, montage, next };
}

it('reuses admitted children on Scenario rename and preserves Montage sources', async () => {
  const f = await withDependentMontage();
  const assets = await loadScenarioReplicaPredecessorAssets({
    spaceId: f.input.spaceId,
    profileCreatedAt: f.input.profileCreatedAt,
    connectionGeneration: f.input.connectionGeneration,
    rootId: f.input.root.entry.id,
    expectedLocalGeneration: 1,
    expectedBasis: [f.input.operationId],
  });
  expect(assets).toEqual([{ entry: expect.objectContaining(f.child), ref: f.ref }]);
  const beforeChildren = structuredClone(f.fixture.rows.get('scenario_assets'));
  const beforeOwners = structuredClone(f.fixture.rows.get('asset_owners'));
  expect(await applyPreparedScenarioReplica(f.next)).toMatchObject({
    status: 'applied',
    generation: 2,
  });
  expect((await f.current())?.project.name).toBe('Renamed Scenario');
  expect(f.fixture.rows.get('video_projects')!.get(f.montage.id)).toEqual(f.montage);
  expect(f.fixture.rows.get('scenario_assets')).toEqual(beforeChildren);
  expect(f.fixture.rows.get('asset_owners')).toEqual(beforeOwners);
  expect(f.fixture.rows.get('project_assets')!.size).toBe(0);
});

it.each(['changed', 'deleted', 'owner'] as const)(
  'refuses Scenario successor with %s required Montage source and preserves every table',
  async (change) => {
    const f = await withDependentMontage();
    if (change === 'changed')
      f.next.root.assets[0] = {
        entry: { ...f.child, assetId: 'changed-bytes' },
        ref: {
          ...f.ref,
          assetId: 'changed-bytes',
          location: { kind: 'opfs', objectKey: 'objects/changed-bytes' },
        },
      };
    else if (change === 'deleted') f.next.root.assets = [];
    else
      f.fixture.rows
        .get('asset_owners')!
        .delete(JSON.stringify(['scenario-asset', f.child.id, 'body']));
    const before = structuredClone(f.fixture.rows);
    await expect(applyPreparedScenarioReplica(f.next)).rejects.toThrow();
    expect(f.fixture.rows).toEqual(before);
  }
);

it('serializes two incoming writers against the same native predecessor and preserves the winner', async () => {
  const f = setup();
  const other = structuredClone(f.input);
  other.operationId = 'competing-operation';
  other.sourceDigest = 'b'.repeat(64);
  other.root.entry.project.name = 'Competing guide';
  const result = await Promise.allSettled([
    applyPreparedScenarioReplica(f.input),
    applyPreparedScenarioReplica(other),
  ]);
  expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
  expect(result.filter((item) => item.status === 'rejected')).toHaveLength(1);
  expect((await f.current())?.project.name).toBe('Remote guide');
});

it('rolls back native Scenario publication when its receipt fails and permits exact retry', async () => {
  const f = setup();
  f.fail();
  await expect(applyPreparedScenarioReplica(f.input)).rejects.toThrow();
  expect(await f.current()).toBeNull();
  f.resume();
  expect(await applyPreparedScenarioReplica(f.input)).toMatchObject({
    status: 'applied',
    generation: 1,
  });
});

it('refuses delayed publication after delete/recreate and does not overwrite the new identity', async () => {
  const f = setup();
  await applyPreparedScenarioReplica(f.input);
  const before = (await f.current())!;
  const delayed = structuredClone(f.input);
  delayed.operationId = 'delayed-operation';
  delayed.sourceDigest = 'c'.repeat(64);
  delayed.expectedLocalGeneration = 1;
  delayed.expectedBasis = [f.input.operationId];
  delayed.expectedWorkspaceRevision = before.workspaceRevision;
  const rootKey = captureRootKey('space', 'scenario-project', 'guide');
  f.fixture.rows.get('scenario_projects')!.set('guide', {
    ...before,
    workspaceRevision: before.workspaceRevision + 2,
    project: { ...before.project, name: 'Recreated identity' },
  });
  f.fixture.rows.get('sync_capture')!.set(JSON.stringify(['root-state', rootKey]), {
    version: 1,
    kind: 'root-state',
    key: JSON.stringify(['root-state', rootKey]),
    createdAt: 1,
    spaceId: 'space',
    rootKind: 'scenario-project',
    rootId: 'guide',
    rootKey,
    generation: 3,
    basis: ['recreation'],
    nativeRevision: before.workspaceRevision + 2,
  });
  await expect(applyPreparedScenarioReplica(delayed)).rejects.toThrow();
  expect((await f.current())?.project.name).toBe('Recreated identity');
});

async function scenarioDeletion(
  f: ReturnType<typeof setup>,
  operationId = 'scenario-delete'
): Promise<ApplyCatalogDeletionInput> {
  const rootId = f.input.root.entry.id;
  const rootKey = captureRootKey(f.input.spaceId, 'scenario-project', rootId);
  const state = parseSyncCaptureRecord(
    f.fixture.rows.get('sync_capture')!.get(JSON.stringify(['root-state', rootKey]))
  );
  if (!state || state.kind !== 'root-state') throw new Error('Missing published Scenario state');
  return {
    spaceId: f.input.spaceId,
    profileCreatedAt: f.input.profileCreatedAt,
    connectionGeneration: f.input.connectionGeneration,
    rootKind: 'scenario-project',
    rootId,
    operationId,
    sourceDigest: 'd'.repeat(64),
    expectedLocalGeneration: state.generation,
    expectedBasis: state.basis,
    expectedWorkspaceRevision: (await f.current())?.workspaceRevision ?? null,
  };
}
function retainedJournal(
  domain: string,
  payload: unknown,
  assetRefs: AssetRef[] = []
): AssetReadyJournal {
  return { domain, payload, journalId: 'retained-journal', createdAt: 1, assetRefs };
}
function scenarioJournal(f: ReturnType<typeof setup>, domain: string, foreign = false) {
  const entry = foreign
    ? createScenarioProjectEntry({
        project: createGuideProject('Other guide', 'other-guide', 100),
        existing: undefined,
        updatedAt: 100,
      })
    : f.input.root.entry;
  if (domain === 'scenario-html-exports') {
    const ref: AssetRef = {
      assetId: 'pending-html',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'objects/pending-html' },
      mimeType: 'text/html;charset=utf-8',
      size: 4,
      sha256: null,
    };
    return retainedJournal(
      domain,
      {
        id: 'pending-export',
        projectId: entry.id,
        format: 'html',
        filename: 'guide.html',
        createdAt: 1,
        size: ref.size,
        html: { mode: 'guide', assetId: ref.assetId },
      },
      [ref]
    );
  }
  if (domain === 'scenario-assets')
    return retainedJournal(domain, {
      project: entry.project,
      targetEntry: entry,
      committedAt: 100,
      baseRevision: null,
      children: {
        assetPuts: [],
        assetDeletes: [],
        editorDocumentPuts: [],
        editorDocumentDeletes: [],
      },
    });
  return retainedJournal(domain, {
    kind: 'scenario-project',
    input: {
      ...f.input,
      ...(foreign ? { operationId: 'foreign-operation', sourceDigest: 'f'.repeat(64) } : {}),
      root: { ...f.input.root, entry },
    },
  });
}

it('deletes a published Scenario and restores the same identity above its graveyard revision', async () => {
  const f = setup();
  await applyPreparedScenarioReplica(f.input);
  const prior = (await f.current())!;
  const deletion = await scenarioDeletion(f);
  const delayed = {
    ...structuredClone(f.input),
    operationId: 'delayed-edit',
    expectedLocalGeneration: 1,
    expectedBasis: [f.input.operationId],
    expectedWorkspaceRevision: prior.workspaceRevision,
  };
  expect(await applyCatalogDeletionNative(deletion)).toEqual({ status: 'applied', generation: 2 });
  expect(await f.current()).toBeNull();
  const key = JSON.stringify(['root-state', captureRootKey('space', 'scenario-project', 'guide')]);
  expect(f.fixture.rows.get('sync_capture')!.get(key)).toMatchObject({
    generation: 2,
    deleted: true,
    basis: [deletion.operationId],
    nativeRevision: prior.workspaceRevision,
  });
  await expect(applyPreparedScenarioReplica(delayed)).rejects.toThrow();
  const restored = {
    ...structuredClone(f.input),
    operationId: 'scenario-restore',
    expectedLocalGeneration: 2,
    expectedBasis: [deletion.operationId],
    expectedWorkspaceRevision: null,
  };
  restored.root.entry.project.name = 'Restored guide';
  expect(await applyPreparedScenarioReplica(restored)).toEqual({
    status: 'applied',
    generation: 3,
  });
  expect((await f.current())?.workspaceRevision).toBeGreaterThan(prior.workspaceRevision);
  const beforeReplay = structuredClone(f.fixture.rows);
  expect(await applyCatalogDeletionNative(deletion)).toEqual({
    status: 'duplicate',
    generation: 2,
  });
  expect(await applyPreparedScenarioReplica(f.input)).toEqual({
    status: 'duplicate',
    generation: 1,
  });
  await expect(applyPreparedScenarioReplica(delayed)).rejects.toThrow();
  expect(f.fixture.rows).toEqual(beforeReplay);
  expect((await f.current())?.project.name).toBe('Restored guide');
});

it('rolls back a Scenario deletion receipt failure and completes its exact retry', async () => {
  const f = setup();
  await applyPreparedScenarioReplica(f.input);
  const deletion = await scenarioDeletion(f);
  const before = structuredClone(f.fixture.rows);
  f.fail();
  await expect(applyCatalogDeletionNative(deletion)).rejects.toThrow();
  expect(f.fixture.rows).toEqual(before);
  f.resume();
  expect(await applyCatalogDeletionNative(deletion)).toEqual({ status: 'applied', generation: 2 });
  expect(
    f.fixture.rows
      .get('sync_capture')!
      .get(JSON.stringify(['applied-operation', deletion.spaceId, deletion.operationId]))
  ).toMatchObject({
    kind: 'applied-operation',
    generation: 2,
    sourceDigest: deletion.sourceDigest,
  });
  expect(await applyCatalogDeletionNative(deletion)).toEqual({
    status: 'duplicate',
    generation: 2,
  });
});

it('preserves reader-protected Scenario rows and retries after the reader settles', async () => {
  const f = await withDependentMontage();
  const deletion = await scenarioDeletion(f);
  const before = structuredClone(f.fixture.rows);
  io.busy = true;
  await expect(applyCatalogDeletionNative(deletion)).rejects.toThrow();
  expect(f.fixture.rows).toEqual(before);
  expect(io.cleanup).not.toHaveBeenCalled();
  io.busy = false;
  expect(await applyCatalogDeletionNative(deletion)).toEqual({ status: 'applied', generation: 2 });
  expect(await f.current()).toBeNull();
  const montage = parseVideoProjectEntry(f.fixture.rows.get('video_projects')!.get(f.montage.id));
  expect(montage?.project.source.kind).toBe('manual');
  const source = montage?.project.assets[0]?.source;
  if (source?.kind !== 'project-asset') throw new Error('Missing detached Montage child');
  expect(f.fixture.rows.get('project_assets')!.get(source.projectAssetId)).toMatchObject({
    assetId: f.child.assetId,
    mimeType: f.child.mimeType,
    size: f.child.size,
  });
  expect(f.fixture.rows.get('asset_refs')!.get(f.ref.assetId)).toEqual(f.ref);
  expect(
    f.fixture.rows
      .get('asset_owners')!
      .get(JSON.stringify(['project-asset', source.projectAssetId, 'body']))
  ).toMatchObject({ assetId: f.ref.assetId });
  expect(f.fixture.rows.get('scenario_assets')!.has(f.child.id)).toBe(false);
});

it('refuses a deletion selected before another native Scenario writer commits', async () => {
  const f = await withDependentMontage();
  const deletion = await scenarioDeletion(f);
  let release!: (value: typeof f.database) => void;
  const database = new Promise<typeof f.database>((resolve) => {
    release = resolve;
  });
  io.database.mockReturnValueOnce(database);
  const pending = applyCatalogDeletionNative(deletion);
  const refused = expect(pending).rejects.toThrow();
  expect(await applyPreparedScenarioReplica(f.next)).toMatchObject({
    status: 'applied',
    generation: 2,
  });
  const before = structuredClone(f.fixture.rows);
  release(f.database);
  await refused;
  expect(f.fixture.rows).toEqual(before);
  expect((await f.current())?.project.name).toBe('Renamed Scenario');
});

it.each(['fingerprint', 'revision', 'missing-root'] as const)(
  'refuses Scenario publication and deletion after uncaptured native %s changes',
  async (kind) => {
    const f = await withDependentMontage();
    const deletion = await scenarioDeletion(f);
    if (kind === 'fingerprint')
      f.fixture.rows.get('scenario_assets')!.set(f.child.id, {
        ...f.child,
        width: f.child.width + 1,
      });
    else if (kind === 'revision') {
      const head = f.fixture.rows.get('scenario_projects')!.get(f.input.root.entry.id);
      if (!isRecord(head)) throw new Error('Missing Scenario head');
      f.fixture.rows.get('scenario_projects')!.set(f.input.root.entry.id, {
        ...head,
        workspaceRevision: (await f.current())!.workspaceRevision + 1,
      });
    } else f.fixture.rows.get('scenario_projects')!.delete(f.input.root.entry.id);
    const before = structuredClone(f.fixture.rows);
    await expect(applyPreparedScenarioReplica(f.next)).rejects.toThrow();
    await expect(applyCatalogDeletionNative(deletion)).rejects.toThrow();
    expect(f.fixture.rows).toEqual(before);
  }
);

it.each(['scenario-html-exports', 'scenario-assets', 'sync-replica'])(
  'retains a Scenario behind a pending %s journal until exact retry',
  async (domain) => {
    const f = setup();
    await applyPreparedScenarioReplica(f.input);
    const deletion = await scenarioDeletion(f);
    io.journals.mockResolvedValue([scenarioJournal(f, domain)]);
    const before = structuredClone(f.fixture.rows);
    await expect(applyCatalogDeletionNative(deletion)).rejects.toThrow();
    if (domain !== 'sync-replica')
      await expect(
        applyPreparedScenarioReplica({
          ...f.input,
          operationId: 'successor',
          expectedLocalGeneration: 1,
          expectedBasis: [f.input.operationId],
          expectedWorkspaceRevision: (await f.current())!.workspaceRevision,
        })
      ).rejects.toThrow();
    expect(f.fixture.rows).toEqual(before);
    io.journals.mockResolvedValue([]);
    expect(await applyCatalogDeletionNative(deletion)).toEqual({
      status: 'applied',
      generation: 2,
    });
  }
);

it.each([
  ['scenario-html-exports', null],
  ['scenario-assets', { project: null }],
  ['sync-replica', null],
  ['sync-replica', { input: null }],
  ['sync-replica', { kind: 'scenario-project', input: { root: {} } }],
])('refuses unknown Scenario ownership in a malformed %s journal', async (domain, payload) => {
  const f = setup();
  await applyPreparedScenarioReplica(f.input);
  const deletion = await scenarioDeletion(f);
  if (typeof domain !== 'string') throw new Error('Invalid journal fixture domain');
  io.journals.mockResolvedValue([retainedJournal(domain, payload)]);
  const before = structuredClone(f.fixture.rows);
  await expect(applyCatalogDeletionNative(deletion)).rejects.toThrow();
  expect(f.fixture.rows).toEqual(before);
  io.journals.mockResolvedValue([]);
  expect(await applyCatalogDeletionNative(deletion)).toEqual({ status: 'applied', generation: 2 });
});

it('keeps unrelated publication journals independent of a Scenario successor and deletion', async () => {
  const f = setup();
  await applyPreparedScenarioReplica(f.input);
  io.journals.mockResolvedValue([
    scenarioJournal(f, 'scenario-html-exports', true),
    scenarioJournal(f, 'scenario-assets', true),
    scenarioJournal(f, 'sync-replica', true),
    retainedJournal('sync-replica', { kind: 'media', input: {} }),
    retainedJournal('project-assets', { entry: { id: 'unrelated' } }),
  ]);
  const next = {
    ...structuredClone(f.input),
    operationId: 'scenario-successor',
    expectedLocalGeneration: 1,
    expectedBasis: [f.input.operationId],
    expectedWorkspaceRevision: (await f.current())!.workspaceRevision,
  };
  expect(await applyPreparedScenarioReplica(next)).toMatchObject({
    status: 'applied',
    generation: 2,
  });
  expect(await applyCatalogDeletionNative(await scenarioDeletion(f))).toEqual({
    status: 'applied',
    generation: 3,
  });
});

it('publishes detached saved history and a native Scenario thumbnail', async () => {
  const f = setup();
  const next = createScenarioProjectEntry({
    existing: f.input.root.entry,
    project: { ...f.input.root.entry.project, name: 'Guide with history' },
    updatedAt: 200,
  });
  const { history, ...entry } = next;
  if (!history?.length) throw new Error('Missing saved history fixture');
  const body = new File([JSON.stringify(history)], 'history.json', { type: 'application/json' });
  const historyRef: AssetRef = {
    assetId: 'history-sidecar',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/history-sidecar' },
    mimeType: body.type,
    size: body.size,
    sha256: hashCaptureText(await body.text()),
  };
  const thumbnailRef: AssetRef = {
    assetId: 'thumbnail-sidecar',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/thumbnail-sidecar' },
    mimeType: 'image/png',
    size: 3,
    sha256: null,
  };
  const fallback = io.read.getMockImplementation();
  if (!fallback) throw new Error('Missing native file reader fixture');
  io.read.mockImplementation((ref: AssetRef) =>
    ref.assetId === historyRef.assetId ? body : fallback(ref)
  );
  f.input.root = {
    ...f.input.root,
    entry,
    historyRef,
    thumbnails: [
      {
        entry: {
          assetId: `scenario:${entry.id}`,
          createdAt: 1,
          updatedAt: 1,
          width: 10,
          height: 10,
        },
        ref: thumbnailRef,
      },
    ],
  };
  expect(await applyPreparedScenarioReplica(f.input)).toMatchObject({
    status: 'applied',
    generation: 1,
  });
  expect((await f.current())?.history).toEqual(history);
  expect(f.fixture.rows.get('scenario_project_history')!.size).toBe(1);
  expect(f.fixture.rows.get('thumbnails')!.get(`scenario:${entry.id}`)).toMatchObject({
    blob: expect.any(Blob),
    width: 10,
    height: 10,
  });
  const before = structuredClone(f.fixture.rows);
  expect(await applyPreparedScenarioReplica(f.input)).toEqual({
    status: 'duplicate',
    generation: 1,
  });
  expect(f.fixture.rows).toEqual(before);
});

it.each(['complete', 'missing', 'generation', 'retarget'] as const)(
  'admits a borrowed Scenario image only with its exact causal source: %s',
  async (condition) => {
    const f = setup();
    const ref: AssetRef = {
      assetId: 'borrowed-image-bytes',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'objects/borrowed-image-bytes' },
      mimeType: 'image/png',
      size: 3,
      sha256: null,
    };
    const media = createMediaLibraryEntry({
      id: 'borrowed-image',
      kind: 'image',
      source: { kind: 'stored-asset', assetId: ref.assetId },
      mimeType: ref.mimeType,
      size: ref.size,
      workspaceRevision: 0,
    });
    const rows = f.fixture.rows;
    rows.get('media_library')!.set(media.id, media);
    rows.get('asset_refs')!.set(ref.assetId, ref);
    const ownerKey = JSON.stringify(['media-library', media.id, 'source']);
    rows.get('asset_owners')!.set(ownerKey, {
      ownerKind: 'media-library',
      ownerId: media.id,
      role: 'source',
      assetId: ref.assetId,
    });
    const rootKey = captureRootKey(f.input.spaceId, 'media', media.id);
    const stateKey = JSON.stringify(['root-state', rootKey]);
    rows.get('sync_capture')!.set(stateKey, {
      version: 1,
      kind: 'root-state',
      key: stateKey,
      createdAt: 1,
      spaceId: f.input.spaceId,
      rootKind: 'media',
      rootId: media.id,
      rootKey,
      generation: 4,
      basis: ['library-source'],
    });
    f.input.root.assets = [
      {
        entry: {
          id: 'borrowed-child',
          projectId: f.input.root.entry.id,
          assetId: ref.assetId,
          borrowedMediaId: media.id,
          galleryAssetId: media.id,
          mimeType: ref.mimeType,
          size: ref.size,
          width: 10,
          height: 10,
          createdAt: 1,
        },
        ref,
      },
    ];
    f.input.dependencies =
      condition === 'missing'
        ? []
        : [
            {
              entry: media,
              ref,
              expectedGeneration: 4,
              expectedBasis: ['library-source'],
            },
          ];
    if (condition === 'generation')
      rows.get('sync_capture')!.set(stateKey, {
        version: 1,
        kind: 'root-state',
        key: stateKey,
        createdAt: 1,
        spaceId: f.input.spaceId,
        rootKind: 'media',
        rootId: media.id,
        rootKey,
        generation: 5,
        basis: ['new-library-write'],
      });
    if (condition === 'retarget')
      rows.get('media_library')!.set(media.id, {
        ...media,
        source: { kind: 'stored-asset', assetId: 'replacement-image' },
      });
    const before = structuredClone(rows);
    if (condition !== 'complete') {
      await expect(applyPreparedScenarioReplica(f.input)).rejects.toThrow();
      expect(rows).toEqual(before);
      return;
    }
    expect(await applyPreparedScenarioReplica(f.input)).toMatchObject({
      status: 'applied',
      generation: 1,
    });
    expect(rows.get('media_library')!.get(media.id)).toEqual(media);
    expect(rows.get('asset_refs')!.get(ref.assetId)).toEqual(ref);
    expect(rows.get('asset_owners')!.get(ownerKey)).toEqual(
      before.get('asset_owners')!.get(ownerKey)
    );
    expect(rows.get('scenario_assets')!.get('borrowed-child')).toMatchObject({
      borrowedMediaId: media.id,
      assetId: ref.assetId,
    });
  }
);
