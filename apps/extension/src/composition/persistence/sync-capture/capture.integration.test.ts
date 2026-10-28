import { CaptureMode, VideoDisplaySurface } from '@sniptale/runtime-contracts/video/types/types';
import { createNativeCapture } from './test-support/frozen-snapshot-database';
import { commitPreparedOutgoingOperation, preparedOutgoingOperationKey } from './outgoing';
import { commitOutgoingDispatchAttempt } from './outgoing-attempts';
import { commitVerifiedOutgoingResult } from './outgoing-results';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { createVideoProject, createProjectExportEntry } from '../projects/index.test-support';
import { createVideoProjectFromRecording } from '../../../features/video/project/factories/creation';
import { buildRecordingMediaEntry } from '../media-library/entry-mapping';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { saveVideoProject, deleteVideoProject } from '../projects/index';
import { hashCaptureText, parseSyncCaptureRecord } from './guards';
import { captureVideoProjectInTransaction } from './capture';
import { createProjectMutationStores } from '../projects/mutation-stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import { installExperimentalCaptureProfile } from './profile';
import { applyVideoProjectForCapturePrototype } from './test-support/apply-video-project';
import type { AssetRef } from '../assets/contracts';
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
let captureWritesBeforeFailure: number | null = null;
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
    if (parsed.kind === 'sync-operation' && parsed.phase === 'native') output.push(parsed);
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
  captureWritesBeforeFailure = null;
  fixture = createReviewWorkspaceStoreFixture((name) => {
    if (name !== 'sync_capture') return false;
    if (captureWritesBeforeFailure !== null) {
      if (captureWritesBeforeFailure === 0) {
        captureWritesBeforeFailure = null;
        return true;
      }
      captureWritesBeforeFailure -= 1;
    }
    return failCaptureWrite;
  });
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
  const rootKey = changes[1]!.rootKey;
  expect(table('sync_capture').get(JSON.stringify(['root-state', rootKey]))).toMatchObject({
    deleted: true,
  });
});

it('keeps native and capture generations through identical recreation with a frozen clock', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  const first = await saveVideoProject(createVideoProject({ id: projectId }), {
    expectedWorkspaceRevision: null,
  });
  const originalAuthoredState = structuredClone(first.project);
  await deleteVideoProject(projectId);
  const tombstone = captures()[1]!;
  const stateKey = JSON.stringify(['root-state', tombstone.rootKey]);
  expect(table('sync_capture').get(stateKey)).toMatchObject({ deleted: true });
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
  expect(table('sync_capture').get(stateKey)).not.toHaveProperty('deleted');
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

it('captures a pre-profile Library dependency with its project in one native save', async () => {
  table('sync_capture').clear();
  const data = await publishDependency();
  const nativeMedia = structuredClone(table('media_library').get(data.mediaId));
  expect(captures()).toEqual([]);
  await installExperimentalCaptureProfile(profile());
  await saveVideoProject(data.project, { expectedWorkspaceRevision: null });
  const initial = captures();
  const media = initial.find((row) => row.rootKind === 'media');
  const project = initial.find((row) => row.rootKind === 'video-project');
  expect(media).toMatchObject({ rootId: data.mediaId, generation: 1, basis: [] });
  if (project?.change.kind !== 'video-project' || media?.change.kind !== 'media')
    throw new Error('Expected native dependency and project captures');
  const { parseMediaLibraryEntry } = await import('../media-library/read-guards');
  expect(media.change.rows.media).toEqual(parseMediaLibraryEntry(nativeMedia));
  expect(project.change.rows.mediaDependencies).toEqual([
    { mediaId: data.mediaId, generation: 1, basis: [media.operationId] },
  ]);
  const current = currentProject();
  await saveVideoProject(
    { ...current.project, name: 'Second accepted edit' },
    { expectedWorkspaceRevision: current.workspaceRevision ?? 0, expectedProject: current.project }
  );
  expect(captures().filter((row) => row.rootKind === 'media')).toEqual([media]);
  expect(captures()).toHaveLength(3);
  expect(table('media_library').get(data.mediaId)).toEqual(nativeMedia);
});

it('rolls back dependency genesis and native project when the project capture append fails', async () => {
  table('sync_capture').clear();
  const data = await publishDependency();
  await installExperimentalCaptureProfile(profile());
  const before = structuredClone(fixture.rows);
  // The dependency capture and its root state succeed before the project capture add fails.
  captureWritesBeforeFailure = 2;
  await expect(
    saveVideoProject(data.project, { expectedWorkspaceRevision: null })
  ).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  expect(fixture.rows).toEqual(before);
  expect(table('video_projects').has(data.project.id)).toBe(false);
  await saveVideoProject(data.project, { expectedWorkspaceRevision: null });
  expect(captures().filter((row) => row.rootId === data.mediaId)).toHaveLength(1);
  expect(captures().filter((row) => row.rootId === data.project.id)).toHaveLength(1);
});

it('accepts dependency genesis and its project beyond the former 128 capture boundary', async () => {
  table('sync_capture').clear();
  const data = await publishDependency();
  await installExperimentalCaptureProfile(profile());
  await saveVideoProject(createVideoProject({ id: 'capacity-seed' }), {
    expectedWorkspaceRevision: null,
  });
  const template = captures()[0]!;
  for (let index = 1; index < 127; index += 1) {
    const operationId = crypto.randomUUID();
    const key = JSON.stringify(['change', operationId]);
    table('sync_capture').set(key, createNativeCapture({ ...template, key, operationId }));
  }
  await saveVideoProject(data.project, { expectedWorkspaceRevision: null });
  expect(captures()).toHaveLength(129);
  const media = captures().find((row) => row.rootId === data.mediaId)!;
  const project = captures().find((row) => row.rootId === data.project.id)!;
  expect(project).toMatchObject({
    change: {
      rows: {
        mediaDependencies: [
          { mediaId: data.mediaId, generation: media.generation, basis: [media.operationId] },
        ],
      },
    },
  });
  expect(table('video_projects').has(data.project.id)).toBe(true);
});

it.each(['malformed', 'empty-basis', 'wrong-digest'])(
  'refuses %s existing dependency evidence instead of creating genesis',
  async (kind) => {
    const data = await publishDependency();
    const [stateKey, state] = [...table('sync_capture')].find(
      ([, raw]) => parseSyncCaptureRecord(raw)?.kind === 'root-state'
    )!;
    if (typeof state !== 'object' || state === null) throw new Error('Missing root state');
    table('sync_capture').set(
      stateKey,
      kind === 'malformed'
        ? { corrupt: true }
        : kind === 'empty-basis'
          ? { ...state, basis: [] }
          : { ...state, nativeDigest: '0'.repeat(64) }
    );
    const before = structuredClone(fixture.rows);
    await expect(
      saveVideoProject(data.project, { expectedWorkspaceRevision: null })
    ).rejects.toMatchObject({
      name: 'UnsupportedSyncCaptureGraphError',
    });
    expect(fixture.rows).toEqual(before);
  }
);

it('keeps saving offline past 128 retained revisions without losing causal history', async () => {
  let entry = await saveVideoProject(createVideoProject({ id: projectId, name: 'Offline 0' }), {
    expectedWorkspaceRevision: null,
  });
  for (let index = 1; index < 132; index += 1) {
    entry = await saveVideoProject(
      { ...entry.project, name: `Offline ${index}` },
      { expectedWorkspaceRevision: entry.workspaceRevision ?? 0, expectedProject: entry.project }
    );
  }
  const retained = captures();
  expect(retained).toHaveLength(132);
  expect(new Set(retained.map((row) => row.operationId)).size).toBe(132);
  for (let index = 1; index < retained.length; index += 1) {
    expect(retained[index]!.generation).toBe(retained[index - 1]!.generation + 1);
    expect(retained[index]!.basis).toEqual([retained[index - 1]!.operationId]);
  }
  expect(currentProject().project.name).toBe('Offline 131');
});

it('preserves publication identity and its causal successor across all phases', async () => {
  const saved = await saveVideoProject(
    createVideoProject({ id: projectId, name: 'Publication source' })
  );
  const native = await publicationCapture('phase-replay');
  const prepared = await commitPreparedOutgoingOperation(native, {
    version: 1,
    key: preparedOutgoingOperationKey(native.spaceId, native.operationId),
    createdAt: native.createdAt,
    spaceId: native.spaceId,
    connectionGeneration: native.connectionGeneration,
    captureKey: native.key,
    rootKey: native.rootKey,
    generation: native.generation,
    operationId: native.operationId,
    recordText: '{}',
    recordSha256: hashCaptureText('{}'),
    objects: [],
  });
  expect(await publicationCapture('phase-replay')).toMatchObject({
    phase: 'prepared',
    operationId: native.operationId,
    sourceSha256: native.sourceSha256,
  });
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const recordText = JSON.stringify({
    format: 'sniptale-sync-attempt',
    version: 1,
    attemptId,
    operationText: prepared.recordText,
    operationSha256: prepared.recordSha256,
    objects: [],
  });
  const { attempt } = await commitOutgoingDispatchAttempt(prepared, {
    version: 1,
    spaceId: native.spaceId,
    operationId: native.operationId,
    connectionGeneration: native.connectionGeneration,
    attemptId,
    preparedSha256: prepared.recordSha256,
    recordText,
    recordSha256: hashCaptureText(recordText),
    recordKey: 'records/publication.json',
    objects: [],
  });
  await commitVerifiedOutgoingResult(prepared, attempt);
  const beforeReplay = structuredClone(fixture.rows);
  const replay = await publicationCapture('phase-replay');
  expect(replay).toMatchObject({
    phase: 'published',
    operationId: native.operationId,
    sourceSha256: native.sourceSha256,
  });
  expect(replay).not.toHaveProperty('change');
  expect(replay).not.toHaveProperty('prepared');
  expect(fixture.rows).toEqual(beforeReplay);
  await saveVideoProject(
    { ...saved.project, name: 'Next local edit' },
    { expectedWorkspaceRevision: saved.workspaceRevision ?? 0, expectedProject: saved.project }
  );
  expect(captures().at(-1)).toMatchObject({
    generation: native.generation + 1,
    basis: [native.operationId],
  });
});

it('publishes a recording Montage export and preserves its capture through the next save', async () => {
  const { publishProjectExportJournal, PROJECT_EXPORT_PUBLICATION_DOMAIN } =
    await import('../projects/asset-publication');
  const recording = {
    id: 'export-source',
    assetId: 'export-source-bytes',
    filename: 'Source.webm',
    createdAt: 1,
    mimeType: 'video/webm',
    size: 16,
    recordingMetadata: {
      captureMode: CaptureMode.TAB,
      displaySurface: VideoDisplaySurface.BROWSER,
      actionCount: 4,
      hasPointer: true,
    },
  };
  const sourceRef: AssetRef = {
    assetId: recording.assetId,
    createdAt: 1,
    mimeType: recording.mimeType,
    size: recording.size,
    sha256: null,
    location: { kind: 'opfs', objectKey: `objects/${recording.assetId}` },
  };
  const sourceOwner = {
    assetId: recording.assetId,
    ownerId: recording.id,
    ownerKind: 'recording',
    role: 'body',
  };
  const media = buildRecordingMediaEntry(recording);
  table('recordings').set(recording.id, recording);
  table('media_library').set(media.id, media);
  table('asset_refs').set(recording.assetId, sourceRef);
  table('asset_owners').set(JSON.stringify(['recording', recording.id, 'body']), sourceOwner);
  const project = createVideoProjectFromRecording({
    recordingId: recording.id,
    filename: recording.filename,
    width: 640,
    height: 360,
    duration: 2,
    mimeType: recording.mimeType,
    size: recording.size,
    hasAudio: true,
    recordingSignals: [],
  });
  project.id = projectId;
  const first = await saveVideoProject(project, { expectedWorkspaceRevision: null });
  const beforePublication = captures().find((row) => row.rootKind === 'video-project')!;
  const exported = createProjectExportEntry({
    id: 'recording-montage-export',
    projectId,
    assetId: 'recording-montage-export-bytes',
    recordingMetadata: recording.recordingMetadata,
  });
  const ref: AssetRef = {
    ...sourceRef,
    assetId: exported.assetId,
    mimeType: exported.mimeType!,
    size: exported.size,
    location: { kind: 'opfs', objectKey: `objects/${exported.assetId}` },
  };
  const journal = {
    journalId: 'recording-montage-export-journal',
    domain: PROJECT_EXPORT_PUBLICATION_DOMAIN,
    createdAt: 1,
    assetRefs: [ref],
    payload: { entry: exported },
  };
  await publishProjectExportJournal(journal);
  const published = captures()
    .filter((row) => row.rootKind === 'video-project')
    .at(-1)!;
  if (published.change.kind !== 'video-project') throw new Error('Expected parent capture');
  expect(published.basis).toEqual([beforePublication.operationId]);
  expect(published.change.rows.exports).toContainEqual(exported);
  expect(published.change.rows.media).toContainEqual(
    expect.objectContaining({
      id: `export:${exported.id}`,
      recordingMetadata: recording.recordingMetadata,
    })
  );
  expect(published.change.rows.refs).toContainEqual(ref);
  expect(table('project_exports').get(exported.id)).toEqual(exported);
  expect(
    table('asset_owners').get(JSON.stringify(['project-export', exported.id, 'body']))
  ).toEqual({
    assetId: exported.assetId,
    ownerId: exported.id,
    ownerKind: 'project-export',
    role: 'body',
  });
  const afterPublication = structuredClone(fixture.rows);
  await publishProjectExportJournal(journal);
  expect(fixture.rows).toEqual(afterPublication);
  await saveVideoProject(
    { ...first.project, name: 'Saved after export' },
    { expectedWorkspaceRevision: first.workspaceRevision ?? 0, expectedProject: first.project }
  );
  const saved = captures()
    .filter((row) => row.rootKind === 'video-project')
    .at(-1)!;
  expect(saved.basis).toEqual([published.operationId]);
  expect(saved).toMatchObject({ change: { rows: { exports: [exported] } } });
  expect(currentProject().project.name).toBe('Saved after export');
  expect(table('recordings').get(recording.id)).toEqual(recording);
  expect(table('asset_refs').get(recording.assetId)).toEqual(sourceRef);
  expect(table('asset_owners').get(JSON.stringify(['recording', recording.id, 'body']))).toEqual(
    sourceOwner
  );
});
