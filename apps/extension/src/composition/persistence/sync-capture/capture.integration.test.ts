import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { createVideoProject } from '../projects/index.test-support';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { saveVideoProject, deleteVideoProject } from '../projects/index';
import { parseSyncCaptureRecord } from './guards';
import { captureVideoProjectInTransaction } from './capture';
import { createProjectMutationStores } from '../projects/mutation-stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import { installExperimentalCaptureProfile } from './profile';
import { applyVideoProjectForCapturePrototype } from './test-support/apply-video-project';
import type { CapturedChange, SyncCaptureProfile } from './contracts';

const nativeOwnerMocks = vi.hoisted(() => ({ initDB: vi.fn() }));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: nativeOwnerMocks.initDB,
}));

vi.mock('../projects/asset-publication', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../projects/asset-publication')>()),
  // Empty graphs have no OPFS publication recovery; native save/capture/freezer stay real.
  recoverProjectMediaPublications: vi.fn(async () => undefined),
}));

let failCaptureWrite = false;
let fixture: ReturnType<typeof createReviewWorkspaceStoreFixture>;
const projectId = 'capture-owner-project';

function table(name: string): Map<string, unknown> {
  const rows = fixture.rows.get(name);
  if (!rows) throw new Error('Missing fixture store');
  return rows;
}

function profile(enabled = true): SyncCaptureProfile {
  return {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 100,
    enabled,
    spaceId: 'unit-proof-space',
    connectionGeneration: 1,
  };
}

function captures(): CapturedChange[] {
  const output: CapturedChange[] = [];
  for (const raw of table('sync_capture').values()) {
    const parsed = parseSyncCaptureRecord(raw);
    if (!parsed) throw new Error('Owner committed invalid capture data');
    if (parsed.kind === 'captured-change') output.push(parsed);
  }
  return output.sort((a, b) => a.generation - b.generation);
}

function currentProject() {
  const entry = parseVideoProjectEntry(table('video_projects').get(projectId));
  if (!entry) throw new Error('Missing committed project');
  return entry;
}

beforeEach(async () => {
  vi.clearAllMocks();
  failCaptureWrite = false;
  fixture = createReviewWorkspaceStoreFixture(
    (name) => failCaptureWrite && name === 'sync_capture'
  );
  nativeOwnerMocks.initDB.mockResolvedValue(fixture.database);
  await installExperimentalCaptureProfile(profile());
});

afterEach(() => vi.restoreAllMocks());

it('retains two accepted owner revisions and refuses the stale numeric writer without another intent', async () => {
  const first = await saveVideoProject(createVideoProject({ id: projectId, name: 'Revision N' }), {
    expectedWorkspaceRevision: null,
  });
  const preparedSecondWriter = structuredClone(first.project);
  const frozenFirst = structuredClone(captures()[0]);
  const second = await saveVideoProject(
    { ...first.project, name: 'Revision N plus one' },
    { expectedWorkspaceRevision: first.workspaceRevision ?? 0, expectedProject: first.project }
  );
  const beforeRefusal = structuredClone(fixture.rows);
  await expect(
    saveVideoProject(
      { ...preparedSecondWriter, name: 'Stale second writer' },
      {
        expectedWorkspaceRevision: first.workspaceRevision ?? 0,
        expectedProject: preparedSecondWriter,
      }
    )
  ).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
  expect(fixture.rows).toEqual(beforeRefusal);
  const [n, next] = captures();
  expect(captures()).toHaveLength(2);
  expect(n).toEqual(frozenFirst);
  expect(n?.change.kind).toBe('video-project');
  expect(next?.change.kind).toBe('video-project');
  if (n?.change.kind !== 'video-project' || next?.change.kind !== 'video-project')
    throw new Error('Expected captured after-images');
  expect(n.change.rows.project.project.name).toBe('Revision N');
  expect(next.change.rows.project.project.name).toBe('Revision N plus one');
  expect(n.operationId).not.toBe(next.operationId);
  expect(n.basis).toEqual([]);
  expect(next.basis).toEqual([n.operationId]);
  expect(next.generation).toBe(n.generation + 1);
  expect(second.workspaceRevision).toBeGreaterThan(first.workspaceRevision!);
  expect(currentProject().workspaceRevision).toBe(second.workspaceRevision);
});

it('refuses a delayed owner write after deletion without recreating the root or appending an intent', async () => {
  const accepted = await saveVideoProject(createVideoProject({ id: projectId }), {
    expectedWorkspaceRevision: null,
  });
  const delayed = structuredClone(accepted.project);
  await deleteVideoProject(projectId);
  const afterDelete = structuredClone(fixture.rows);
  await expect(
    saveVideoProject(
      { ...delayed, name: 'Delayed save' },
      { expectedWorkspaceRevision: accepted.workspaceRevision ?? 0, expectedProject: delayed }
    )
  ).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
  expect(table('video_projects').has(projectId)).toBe(false);
  expect(fixture.rows).toEqual(afterDelete);
  const changes = captures();
  expect(changes).toHaveLength(2);
  expect(changes[1]?.change.kind).toBe('tombstone');
  expect(changes[1]?.basis).toEqual([changes[0]!.operationId]);
});

it('keeps native and capture generations through identical recreation with a frozen clock', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  const first = await saveVideoProject(createVideoProject({ id: projectId }), {
    expectedWorkspaceRevision: null,
  });
  const originalAuthoredState = structuredClone(first.project);
  await deleteVideoProject(projectId);
  const tombstone = captures()[1]!;
  const recreated = await saveVideoProject(originalAuthoredState, {
    expectedWorkspaceRevision: null,
    expectedProject: null,
  });
  expect(recreated.project).toEqual(originalAuthoredState);
  expect(recreated.workspaceRevision).toBeGreaterThan(first.workspaceRevision!);
  expect(table('video_project_revisions').get(projectId)).toMatchObject({
    projectId,
    revision: recreated.workspaceRevision,
  });
  const changes = captures();
  expect(changes).toHaveLength(3);
  expect(changes[2]?.generation).toBe(3);
  expect(changes[2]?.basis).toEqual([tombstone.operationId]);
  const beforeRefusal = structuredClone(fixture.rows);
  await expect(
    saveVideoProject(originalAuthoredState, {
      expectedWorkspaceRevision: first.workspaceRevision ?? 0,
    })
  ).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
  expect(fixture.rows).toEqual(beforeRefusal);
});

it('rolls back root counter and capture after failure and admits one retry', async () => {
  const first = await saveVideoProject(
    createVideoProject({ id: projectId, name: 'Accepted source' }),
    { expectedWorkspaceRevision: null }
  );
  const beforeFailure = structuredClone(fixture.rows);
  const candidate = { ...first.project, name: 'Accepted retry' };
  failCaptureWrite = true;
  await expect(
    saveVideoProject(candidate, {
      expectedWorkspaceRevision: first.workspaceRevision ?? 0,
      expectedProject: first.project,
    })
  ).rejects.toMatchObject({ name: 'QuotaExceededError' });
  expect(fixture.rows).toEqual(beforeFailure);
  failCaptureWrite = false;
  const retry = await saveVideoProject(candidate, {
    expectedWorkspaceRevision: first.workspaceRevision ?? 0,
    expectedProject: first.project,
  });
  expect(retry.workspaceRevision).toBe(first.workspaceRevision! + 1);
  expect(currentProject().project.name).toBe('Accepted retry');
  expect(captures()).toHaveLength(2);
  expect(captures()[1]?.generation).toBe(2);
  expect(captures()[1]?.basis).toEqual([captures()[0]!.operationId]);
});

it.each(['absent', 'disabled'] as const)(
  'keeps local-only owner writes free of capture records when the profile is %s',
  async (mode) => {
    table('sync_capture').clear();
    if (mode === 'disabled') await installExperimentalCaptureProfile(profile(false));
    const saved = await saveVideoProject(createVideoProject({ id: projectId }), {
      expectedWorkspaceRevision: null,
    });
    expect(currentProject().workspaceRevision).toBe(saved.workspaceRevision);
    expect(captures()).toEqual([]);
    expect(table('sync_capture').size).toBe(mode === 'absent' ? 0 : 1);
  }
);

it('commits incoming provenance without an echo and captures the next local edit once', async () => {
  const first = await saveVideoProject(createVideoProject({ id: projectId }), {
    expectedWorkspaceRevision: null,
  });
  const root = {
    entry: { ...first, project: { ...first.project, name: 'Incoming revision' } },
    assets: [],
    exports: [],
  };
  const input = {
    root,
    operationId: 'incoming-operation',
    sourceDigest: 'a'.repeat(64),
    expectedLocalGeneration: 1,
  };
  const beforeFailure = structuredClone(fixture.rows);
  failCaptureWrite = true;
  await expect(applyVideoProjectForCapturePrototype(input)).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  expect(fixture.rows).toEqual(beforeFailure);
  failCaptureWrite = false;
  await expect(applyVideoProjectForCapturePrototype(input)).resolves.toEqual({
    status: 'applied',
    generation: 2,
  });
  expect(captures()).toHaveLength(1);
  await expect(applyVideoProjectForCapturePrototype(input)).resolves.toEqual({
    status: 'duplicate',
    generation: 2,
  });
  await expect(
    applyVideoProjectForCapturePrototype({ ...input, sourceDigest: 'b'.repeat(64) })
  ).rejects.toThrow('identity conflicts');
  const current = currentProject();
  await saveVideoProject(
    { ...current.project, name: 'Local after incoming' },
    { expectedWorkspaceRevision: current.workspaceRevision ?? 0, expectedProject: current.project }
  );
  expect(captures()).toHaveLength(2);
  expect(captures()[1]).toMatchObject({ generation: 3, basis: ['incoming-operation'] });
});

it('refuses the old numeric predecessor after identical canonical restore and accepts a fresh editor', async () => {
  const first = await saveVideoProject(createVideoProject({ id: projectId }), {
    expectedWorkspaceRevision: null,
  });
  await applyVideoProjectForCapturePrototype({
    root: { entry: first, assets: [], exports: [] },
    operationId: 'identical-restore',
    sourceDigest: 'c'.repeat(64),
    expectedLocalGeneration: 1,
  });
  const restored = currentProject();
  expect(restored.project).toEqual(first.project);
  expect(restored.workspaceRevision).toBeGreaterThan(first.workspaceRevision!);
  const beforeRefusal = structuredClone(fixture.rows);
  await expect(
    saveVideoProject(
      { ...first.project, name: 'Old editor' },
      {
        expectedWorkspaceRevision: first.workspaceRevision ?? 0,
        expectedProject: first.project,
      }
    )
  ).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
  expect(fixture.rows).toEqual(beforeRefusal);
  await saveVideoProject(
    { ...restored.project, name: 'Fresh editor' },
    {
      expectedWorkspaceRevision: restored.workspaceRevision ?? 0,
      expectedProject: restored.project,
    }
  );
  expect(currentProject().project.name).toBe('Fresh editor');
  expect(captures()).toHaveLength(2);
  expect(captures()[1]?.basis).toEqual(['identical-restore']);
});

async function publicationCapture(publicationId: string) {
  return runWithIndexedDbMutation(async (db) => {
    const { tx } = createProjectMutationStores(db);
    try {
      const captured = await captureVideoProjectInTransaction(tx, projectId, { publicationId });
      await tx.done;
      if (!captured) throw new Error('Expected enabled publication capture');
      return captured;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}

it('retains the first publication snapshot when replay follows a later owner edit', async () => {
  const first = await saveVideoProject(
    createVideoProject({ id: projectId, name: 'Published source' })
  );
  const published = await publicationCapture('ready-journal');
  await saveVideoProject(
    { ...first.project, name: 'Later edit' },
    {
      expectedWorkspaceRevision: first.workspaceRevision ?? 0,
      expectedProject: first.project,
    }
  );
  const beforeReplay = structuredClone(fixture.rows);
  expect(await publicationCapture('ready-journal')).toEqual(parseSyncCaptureRecord(published));
  expect(fixture.rows).toEqual(beforeReplay);
  expect(captures()).toHaveLength(3);
});

it('refuses contradictory publication receipts without replacing accepted owner data', async () => {
  await saveVideoProject(createVideoProject({ id: projectId }));
  const published = await publicationCapture('ready-journal');
  table('sync_capture').set(published.key, { ...published, rootId: 'contradictory-root' });
  const before = structuredClone(fixture.rows);
  await expect(publicationCapture('ready-journal')).rejects.toThrow('publication receipt');
  expect(fixture.rows).toEqual(before);
});

it('refuses malformed capture profile or root state without resetting a native owner', async () => {
  const first = await saveVideoProject(createVideoProject({ id: projectId }));
  const validProfile = table('sync_capture').get('profile');
  table('sync_capture').set('profile', { ...profile(), version: 2 });
  const invalidProfile = structuredClone(fixture.rows);
  await expect(
    saveVideoProject({ ...first.project, name: 'Refused profile write' })
  ).rejects.toThrow('capture profile');
  expect(fixture.rows).toEqual(invalidProfile);
  table('sync_capture').set('profile', validProfile);
  const state = [...table('sync_capture').values()]
    .map(parseSyncCaptureRecord)
    .find((row) => row?.kind === 'root-state');
  if (!state) throw new Error('Missing native capture state');
  table('sync_capture').set(state.key, { ...state, generation: -1 });
  const invalidState = structuredClone(fixture.rows);
  await expect(saveVideoProject({ ...first.project, name: 'Refused state write' })).rejects.toThrow(
    'root state'
  );
  expect(fixture.rows).toEqual(invalidState);
});

it('refuses invalid or repeated profile setup without erasing pending captures', async () => {
  await saveVideoProject(createVideoProject({ id: projectId }));
  const before = structuredClone(fixture.rows);
  await expect(installExperimentalCaptureProfile({ ...profile(), spaceId: '' })).rejects.toThrow(
    'Invalid'
  );
  await expect(
    installExperimentalCaptureProfile({ ...profile(), spaceId: 'replacement' })
  ).rejects.toThrow('already configured');
  expect(fixture.rows).toEqual(before);
});

async function publishDependency() {
  const { publishProjectAssetJournal, PROJECT_ASSET_PUBLICATION_DOMAIN } =
    await import('../projects/asset-publication');
  const entry = {
    id: 'dependency-asset',
    assetId: 'dependency-bytes',
    createdAt: 1,
    mimeType: 'video/webm',
    size: 1024,
  };
  await publishProjectAssetJournal({
    journalId: 'dependency-journal',
    domain: PROJECT_ASSET_PUBLICATION_DOMAIN,
    createdAt: 1,
    assetRefs: [
      {
        assetId: entry.assetId,
        createdAt: 1,
        mimeType: entry.mimeType,
        size: entry.size,
        sha256: null,
        location: { kind: 'opfs', objectKey: `objects/${entry.assetId}` },
      },
    ],
    payload: { entry, filename: 'dependency.webm' },
  });
  const { createVideoProjectEntryWithMediaClip } = await import('../projects/index.test-support');
  const project = createVideoProjectEntryWithMediaClip().project;
  project.id = projectId;
  const placement = project.assets[0]!;
  placement.source = { kind: 'library-asset', mediaId: `project-asset:${entry.id}` };
  placement.metadata.mimeType = entry.mimeType;
  placement.metadata.size = entry.size;
  return { entry, project, mediaId: `project-asset:${entry.id}` };
}

it('captures the exact accepted Library dependency head with the project after-image', async () => {
  const data = await publishDependency();
  const mediaCapture = captures()[0]!;
  expect(mediaCapture.change.kind).toBe('media');
  await saveVideoProject(data.project, { expectedWorkspaceRevision: null });
  const projectCapture = captures().find((row) => row.rootKind === 'video-project');
  if (projectCapture?.change.kind !== 'video-project') throw new Error('Expected project capture');
  expect(projectCapture.change.rows.mediaDependencies).toEqual([
    {
      mediaId: data.mediaId,
      generation: mediaCapture.generation,
      basis: [mediaCapture.operationId],
    },
  ]);
  expect(projectCapture.operationId).not.toBe(mediaCapture.operationId);
  const parsed = parseSyncCaptureRecord(projectCapture);
  expect(parsed).toMatchObject({
    change: { rows: { mediaDependencies: projectCapture.change.rows.mediaDependencies } },
  });
});

it('refuses changed Library metadata instead of reusing its previous causal head', async () => {
  const data = await publishDependency();
  const current = table('media_library').get(data.mediaId);
  if (typeof current !== 'object' || current === null) throw new Error('Missing dependency');
  table('media_library').set(data.mediaId, { ...current, tags: ['untracked-change'] });
  const before = structuredClone(fixture.rows);
  await expect(
    saveVideoProject(data.project, { expectedWorkspaceRevision: null })
  ).rejects.toMatchObject({ name: 'UnsupportedSyncCaptureGraphError' });
  expect(fixture.rows).toEqual(before);
  expect(captures()).toHaveLength(1);
});

it('refuses an untracked pre-profile Library dependency without inventing its revision', async () => {
  table('sync_capture').clear();
  const data = await publishDependency();
  await installExperimentalCaptureProfile(profile());
  const before = structuredClone(fixture.rows);
  await expect(
    saveVideoProject(data.project, { expectedWorkspaceRevision: null })
  ).rejects.toMatchObject({ name: 'UnsupportedSyncCaptureGraphError' });
  expect(fixture.rows).toEqual(before);
  expect(captures()).toEqual([]);
});
