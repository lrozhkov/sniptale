import { enqueueSyncQueueOperation, beginSyncQueueRun, completeSyncQueueRun } from './queue';
import { CaptureMode, VideoDisplaySurface } from '@sniptale/runtime-contracts/video/types/types';
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
import {
  captureVideoProjectInTransaction,
  captureRootCheckpointInTransaction,
  captureMediaInTransaction,
  captureImageInTransaction,
  captureVideoReviewInTransaction,
} from './capture';
import { readCheckpointInTransaction, deferCheckpointInTransaction } from './checkpoints';
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

vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  readAssetReadyPublicationClaims: async () => ({ valid: true, pending: false, journals: [] }),
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', () => ({
  measureImageBlob: async () => ({ width: 100, height: 80 }),
}));
vi.mock('../../../platform/media-utils/image-thumbnail', () => ({
  createImageThumbnailBlob: async () => new Blob(['thumbnail'], { type: 'image/png' }),
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

it('coalesces accepted native revisions and refuses the stale numeric writer without another intent', async () => {
  const first = await saveVideoProject(createVideoProject({ id: projectId, name: 'Revision N' }), {
    expectedWorkspaceRevision: null,
  });
  const preparedSecondWriter = structuredClone(first.project);
  const firstPending = await pendingSelection('video-project', projectId);
  const second = await saveVideoProject(
    { ...first.project, name: 'Revision N plus one' },
    { expectedWorkspaceRevision: first.workspaceRevision ?? 0, expectedProject: first.project }
  );
  const secondPending = await pendingSelection('video-project', projectId);
  expect(secondPending.revision).not.toBe(firstPending.revision);
  expect(secondPending.createdAt).toBe(firstPending.createdAt);
  expect(secondPending.dueAt).toBe(firstPending.dueAt);
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
  expect(captures()).toEqual([]);
  expect(first.project.name).toBe('Revision N');
  expect(second.workspaceRevision).toBeGreaterThan(first.workspaceRevision!);
  expect(currentProject().workspaceRevision).toBe(second.workspaceRevision);
  const checkpoint = await forceCheckpoint(secondPending);
  expect(checkpoint).toMatchObject({
    generation: 1,
    basis: [],
    change: {
      kind: 'video-project',
      rows: { project: { project: { name: 'Revision N plus one' } } },
    },
  });
  expect(captures()).toHaveLength(1);
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
  expect(changes).toHaveLength(1);
  expect(changes[0]?.change.kind).toBe('tombstone');
  expect(changes[0]?.basis).toEqual([]);
  const rootKey = changes[0]!.rootKey;
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
  const tombstone = captures()[0]!;
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
  const pending = await pendingSelection('video-project', projectId);
  expect(captures()).toEqual([tombstone]);
  expect(table('sync_capture').get(stateKey)).toMatchObject({ deleted: true });
  await publishCapture(tombstone);
  const checkpoint = await forceCheckpoint(pending);
  expect(checkpoint).toMatchObject({ generation: 2, basis: [tombstone.operationId] });
  expect(table('sync_capture').get(stateKey)).not.toHaveProperty('deleted');
  const beforeRefusal = structuredClone(fixture.rows);
  await expect(
    saveVideoProject(originalAuthoredState, {
      expectedWorkspaceRevision: first.workspaceRevision ?? 0,
    })
  ).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
  expect(fixture.rows).toEqual(beforeRefusal);
});

it('rolls back root counter and pending intent after failure and admits one retry', async () => {
  const first = await saveVideoProject(
    createVideoProject({ id: projectId, name: 'Accepted source' }),
    { expectedWorkspaceRevision: null }
  );
  const acceptedPending = await pendingSelection('video-project', projectId);
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
  expect(captures()).toEqual([]);
  const retried = await pendingSelection('video-project', projectId);
  expect(retried.revision).not.toBe(acceptedPending.revision);
  expect(retried.createdAt).toBe(acceptedPending.createdAt);
  expect(retried.dueAt).toBe(acceptedPending.dueAt);
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
  await forceCheckpoint(await pendingSelection('video-project', projectId));
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
  expect(captures()).toHaveLength(1);
  await forceCheckpoint(await pendingSelection('video-project', projectId));
  expect(captures()).toHaveLength(2);
  expect(captures()[1]).toMatchObject({ generation: 3, basis: ['incoming-operation'] });
});

it('refuses the old numeric predecessor after identical canonical restore and accepts a fresh editor', async () => {
  const first = await saveVideoProject(createVideoProject({ id: projectId }), {
    expectedWorkspaceRevision: null,
  });
  await forceCheckpoint(await pendingSelection('video-project', projectId));
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
  expect(captures()).toHaveLength(1);
  await forceCheckpoint(await pendingSelection('video-project', projectId));
  expect(captures()).toHaveLength(2);
  expect(captures()[1]?.basis).toEqual(['identical-restore']);
});

async function lifecycleCaptureForCapacity(rootId: string) {
  return runWithIndexedDbMutation(async (db) => {
    const { tx } = createProjectMutationStores(db, { checkpointAdmission: true });
    try {
      const captured = await captureVideoProjectInTransaction(tx, rootId, {
        checkpoint: 'lifecycle',
      });
      if (!captured || captured.phase !== 'native')
        throw new Error('Expected lifecycle checkpoint');
      await tx.done;
      return captured;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}

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
  expect(captures()).toHaveLength(1);
  expect(await pendingSelection('video-project', projectId)).toBeDefined();
});

it('refuses contradictory publication receipts without replacing accepted owner data', async () => {
  await saveVideoProject(createVideoProject({ id: projectId }));
  const published = await publicationCapture('ready-journal');
  table('sync_capture').set(published.key, { ...published, rootId: 'contradictory-root' });
  const before = structuredClone(fixture.rows);
  await expect(publicationCapture('ready-journal')).rejects.toThrow('publication receipt');
  expect(fixture.rows).toEqual(before);
});

it('refuses malformed profile during save and malformed causal state during checkpoint without repair', async () => {
  const first = await saveVideoProject(createVideoProject({ id: projectId }));
  const acceptedRevision = first.workspaceRevision;
  if (typeof acceptedRevision !== 'number') throw new Error('Expected saved project revision');
  const validProfile = table('sync_capture').get('profile');
  table('sync_capture').set('profile', { ...profile(), version: 2 });
  const invalidProfile = structuredClone(fixture.rows);
  await expect(
    saveVideoProject({ ...first.project, name: 'Refused profile write' })
  ).rejects.toThrow('capture profile');
  expect(fixture.rows).toEqual(invalidProfile);
  table('sync_capture').set('profile', validProfile);
  await forceCheckpoint(await pendingSelection('video-project', projectId));
  const state = [...table('sync_capture').values()]
    .map(parseSyncCaptureRecord)
    .find((row) => row?.kind === 'root-state');
  if (!state) throw new Error('Missing native capture state');
  table('sync_capture').set(state.key, { ...state, generation: -1 });
  await saveVideoProject(
    { ...first.project, name: 'Locally saved beside refused causal state' },
    {
      expectedWorkspaceRevision: acceptedRevision,
      expectedProject: first.project,
    }
  );
  const pending = await pendingSelection('video-project', projectId);
  const invalidState = structuredClone(fixture.rows);
  await expect(forceCheckpoint(pending)).rejects.toThrow('checkpoint predecessor');
  expect(fixture.rows).toEqual(invalidState);
  expect(currentProject().project.name).toBe('Locally saved beside refused causal state');
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
  expect(captures()).toEqual([mediaCapture]);
  await forceCheckpoint(await pendingSelection('video-project', projectId));
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
  await saveVideoProject(data.project, { expectedWorkspaceRevision: null });
  const pending = await pendingSelection('video-project', projectId);
  const before = structuredClone(fixture.rows);
  await expect(forceCheckpoint(pending)).rejects.toMatchObject({
    name: 'UnsupportedSyncCaptureGraphError',
  });
  expect(fixture.rows).toEqual(before);
  expect(captures()).toHaveLength(1);
});

it('checkpoints a saved project and its pre-profile Library dependency atomically', async () => {
  table('sync_capture').clear();
  const data = await publishDependency();
  const nativeMedia = structuredClone(table('media_library').get(data.mediaId));
  expect(captures()).toEqual([]);
  await installExperimentalCaptureProfile(profile());
  await saveVideoProject(data.project, { expectedWorkspaceRevision: null });
  expect(captures()).toEqual([]);
  await forceCheckpoint(await pendingSelection('video-project', projectId));
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
  expect(captures()).toHaveLength(2);
  expect(await pendingSelection('video-project', projectId)).toBeDefined();
  expect(table('media_library').get(data.mediaId)).toEqual(nativeMedia);
});

it(
  'rolls back dependency checkpoint genesis on append failure while preserving the ' +
    'saved project and pending intent',
  async () => {
    table('sync_capture').clear();
    const data = await publishDependency();
    await installExperimentalCaptureProfile(profile());
    await saveVideoProject(data.project, { expectedWorkspaceRevision: null });
    const pending = await pendingSelection('video-project', projectId);
    const before = structuredClone(fixture.rows);
    // The dependency capture and its root state succeed before the project capture add fails.
    captureWritesBeforeFailure = 2;
    await expect(forceCheckpoint(pending)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    expect(fixture.rows).toEqual(before);
    expect(table('video_projects').has(data.project.id)).toBe(true);
    expect(await pendingSelection('video-project', projectId)).toEqual(pending);
    await forceCheckpoint(pending);
    expect(captures().filter((row) => row.rootId === data.mediaId)).toHaveLength(1);
    expect(captures().filter((row) => row.rootId === data.project.id)).toHaveLength(1);
  }
);

it('accepts dependency genesis and its project beyond the former 128 capture boundary', async () => {
  table('sync_capture').clear();
  const data = await publishDependency();
  await installExperimentalCaptureProfile(profile());
  await saveVideoProject(createVideoProject({ id: 'capacity-seed' }), {
    expectedWorkspaceRevision: null,
  });
  for (let index = 0; index < 127; index += 1) {
    await lifecycleCaptureForCapacity('capacity-seed');
  }
  await saveVideoProject(data.project, { expectedWorkspaceRevision: null });
  expect(captures()).toHaveLength(127);
  await forceCheckpoint(await pendingSelection('video-project', projectId));
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
    await saveVideoProject(data.project, { expectedWorkspaceRevision: null });
    const pending = await pendingSelection('video-project', projectId);
    const before = structuredClone(fixture.rows);
    await expect(forceCheckpoint(pending)).rejects.toMatchObject({
      name: 'UnsupportedSyncCaptureGraphError',
    });
    expect(fixture.rows).toEqual(before);
  }
);

it('coalesces 132 offline native revisions while preserving more than 128 retained causal checkpoints', async () => {
  let entry = await saveVideoProject(createVideoProject({ id: projectId, name: 'Offline 0' }), {
    expectedWorkspaceRevision: null,
  });
  // These explicit lifecycle checkpoints are prior retained work, separate from ordinary autosave.
  for (let index = 0; index < 132; index += 1) await lifecycleCaptureForCapacity(projectId);
  const retained = structuredClone(captures());
  for (let index = 1; index < 132; index += 1) {
    entry = await saveVideoProject(
      { ...entry.project, name: `Offline ${index}` },
      { expectedWorkspaceRevision: entry.workspaceRevision ?? 0, expectedProject: entry.project }
    );
  }
  expect(captures()).toEqual(retained);
  const pending = await pendingSelection('video-project', projectId);
  expect(pending.dueAt).toBe(pending.createdAt + 300000);
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
  const queued = await enqueueSyncQueueOperation(native);
  const run = await beginSyncQueueRun(checkpointScope(), native.operationId, queued.revision);
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
  const { result } = await commitVerifiedOutgoingResult(prepared, attempt);
  expect(await completeSyncQueueRun(run, { kind: 'verified', result })).toMatchObject({
    status: 'published',
  });
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
  expect(captures()).toEqual([]);
  const successor = await forceCheckpoint(await pendingSelection('video-project', projectId));
  expect(successor).toMatchObject({
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
  expect(captures().filter((row) => row.rootKind === 'video-project')).toEqual([]);
  const initialPending = await pendingSelection('video-project', projectId);
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
  expect(published.basis).toEqual([]);
  expect(published.generation).toBe(1);
  expect(initialPending.rootId).toBe(projectId);
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
  expect(captures().filter((row) => row.rootKind === 'video-project')).toEqual([published]);
  const pending = await pendingSelection('video-project', projectId);
  await publishCapture(published);
  const saved = await forceCheckpoint(pending);
  if (!saved) throw new Error('Expected successor checkpoint');
  expect(saved.basis).toEqual([published.operationId]);
  expect(saved).toMatchObject({ change: { rows: { exports: [exported] } } });
  expect(currentProject().project.name).toBe('Saved after export');
  expect(table('recordings').get(recording.id)).toEqual(recording);
  expect(table('asset_refs').get(recording.assetId)).toEqual(sourceRef);
  expect(table('asset_owners').get(JSON.stringify(['recording', recording.id, 'body']))).toEqual(
    sourceOwner
  );
});

it('coalesces ten real native project saves into one due immutable checkpoint', async () => {
  table('sync_capture').set('profile', { ...profile(), checkpointIntervalMs: 300000 });
  let saved = await saveVideoProject(createVideoProject({ id: projectId, name: 'Initial local' }), {
    expectedWorkspaceRevision: null,
  });
  for (let i = 0; i < 10; i++) {
    saved = await saveVideoProject(
      { ...saved.project, name: `Native change ${i}` },
      {
        expectedWorkspaceRevision: saved.workspaceRevision ?? 0,
        expectedProject: saved.project,
      }
    );
    expect(captures()).toHaveLength(0);
    expect(currentProject().project.name).toBe(`Native change ${i}`);
  }
  const scope = {
    spaceId: profile().spaceId,
    profileCreatedAt: profile().createdAt,
    connectionGeneration: profile().connectionGeneration,
  };
  const root = { rootKind: 'video-project' as const, rootId: projectId };
  const materialize = (due: boolean) =>
    runWithIndexedDbMutation(async (db) => {
      const { tx } = createProjectMutationStores(db);
      try {
        const pending = await readCheckpointInTransaction(tx, scope, root);
        if (!pending) throw new Error('Expected pending native checkpoint.');
        const result = await captureRootCheckpointInTransaction(tx, pending, {
          now: pending.dueAt - (due ? 0 : 1),
        });
        await tx.done;
        return result;
      } catch (error) {
        return abortIndexedDbMutation(tx, error);
      }
    });
  expect(await materialize(false)).toBeNull();
  expect(captures()).toHaveLength(0);
  const checkpoint = await materialize(true);
  expect(checkpoint?.phase).toBe('native');
  if (checkpoint?.phase !== 'native' || checkpoint.change.kind !== 'video-project')
    throw new Error('Expected project checkpoint.');
  expect(checkpoint.change.rows.project.project.name).toBe('Native change 9');
  expect(captures()).toHaveLength(1);
  expect(
    [...table('sync_capture').values()]
      .map(parseSyncCaptureRecord)
      .filter((row) => row?.kind === 'pending-checkpoint')
  ).toHaveLength(0);
  const next = await saveVideoProject(
    { ...saved.project, name: 'Newer during upload' },
    {
      expectedWorkspaceRevision: saved.workspaceRevision ?? 0,
      expectedProject: saved.project,
    }
  );
  expect(next.project.name).toBe('Newer during upload');
  expect(await materialize(true)).toBeNull();
  expect(captures()).toHaveLength(1);
  expect(
    [...table('sync_capture').values()]
      .map(parseSyncCaptureRecord)
      .filter((row) => row?.kind === 'pending-checkpoint')
  ).toHaveLength(1);
});

it('preserves compact pending work when a stale native project writer is refused', async () => {
  table('sync_capture').set('profile', { ...profile(), checkpointIntervalMs: 300000 });
  const first = await saveVideoProject(createVideoProject({ id: projectId, name: 'First' }), {
    expectedWorkspaceRevision: null,
  });
  await saveVideoProject(
    { ...first.project, name: 'Accepted second' },
    {
      expectedWorkspaceRevision: first.workspaceRevision ?? 0,
      expectedProject: first.project,
    }
  );
  const accepted = structuredClone(fixture.rows);
  await expect(
    saveVideoProject(
      { ...first.project, name: 'Stale competing writer' },
      {
        expectedWorkspaceRevision: first.workspaceRevision ?? 0,
        expectedProject: first.project,
      }
    )
  ).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
  expect(fixture.rows).toEqual(accepted);
  expect(captures()).toHaveLength(0);
});

it('rolls back a real native project save when compact checkpoint persistence fails', async () => {
  table('sync_capture').set('profile', { ...profile(), checkpointIntervalMs: 300000 });
  const before = structuredClone(fixture.rows);
  failCaptureWrite = true;
  await expect(
    saveVideoProject(createVideoProject({ id: projectId }), {
      expectedWorkspaceRevision: null,
    })
  ).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
  failCaptureWrite = false;
  await saveVideoProject(createVideoProject({ id: projectId }), {
    expectedWorkspaceRevision: null,
  });
  expect(captures()).toHaveLength(0);
  expect(
    [...table('sync_capture').values()]
      .map(parseSyncCaptureRecord)
      .filter((row) => row?.kind === 'pending-checkpoint')
  ).toHaveLength(1);
});

it('absorbs pending native work into deletion and refuses delayed saves after recreation', async () => {
  table('sync_capture').set('profile', { ...profile(), checkpointIntervalMs: 300000 });
  const first = await saveVideoProject(
    createVideoProject({ id: projectId, name: 'Old identity' }),
    {
      expectedWorkspaceRevision: null,
    }
  );
  await deleteVideoProject(projectId);
  expect(
    [...table('sync_capture').values()]
      .map(parseSyncCaptureRecord)
      .filter((row) => row?.kind === 'pending-checkpoint')
  ).toHaveLength(0);
  expect(captures()).toHaveLength(1);
  expect(captures()[0]?.change.kind).toBe('tombstone');
  await saveVideoProject(createVideoProject({ id: projectId, name: 'Recreated' }), {
    expectedWorkspaceRevision: null,
  });
  const recreated = structuredClone(fixture.rows);
  await expect(
    saveVideoProject(
      { ...first.project, name: 'Late previous editor' },
      {
        expectedWorkspaceRevision: first.workspaceRevision ?? 0,
        expectedProject: first.project,
      }
    )
  ).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
  expect(fixture.rows).toEqual(recreated);
  expect(currentProject().project.name).toBe('Recreated');
});

const checkpointScope = () => ({
  spaceId: profile().spaceId,
  profileCreatedAt: profile().createdAt,
  connectionGeneration: profile().connectionGeneration,
});
async function pendingSelection(
  rootKind: 'media' | 'video-project' | 'video-review' | 'scenario-project',
  rootId: string
) {
  const tx = fixture.database.transaction(['sync_capture'], 'readonly');
  const pending = await readCheckpointInTransaction(tx, checkpointScope(), { rootKind, rootId });
  await tx.done;
  if (!pending) throw new Error('Missing pending dependency test selection');
  return pending;
}
async function forceCheckpoint(pending: Awaited<ReturnType<typeof pendingSelection>>) {
  return runWithIndexedDbMutation(async (db) => {
    const { tx } = createProjectMutationStores(db, { checkpointAdmission: true });
    try {
      const result = await captureRootCheckpointInTransaction(tx, pending, { force: true });
      await tx.done;
      return result;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}
async function dirtyDependency(mediaId: string, tag = 'pending-native-edit') {
  const { parseMediaLibraryEntry } = await import('../media-library/read-guards');
  const tx = fixture.database.transaction(['media_library', 'sync_capture'], 'readwrite');
  const media = parseMediaLibraryEntry(await tx.objectStore('media_library').get(mediaId));
  if (!media) throw new Error('Missing native dependency fixture');
  await tx.objectStore('media_library').put({ ...media, tags: [tag] });
  await deferCheckpointInTransaction(tx, { rootKind: 'media', rootId: mediaId });
  await tx.done;
}
async function pendingParentWithDependency() {
  table('sync_capture').clear();
  const data = await publishDependency();
  await installExperimentalCaptureProfile({ ...profile(), checkpointIntervalMs: 300000 });
  await dirtyDependency(data.mediaId);
  await saveVideoProject(data.project, { expectedWorkspaceRevision: null });
  return { ...data, pending: await pendingSelection('video-project', data.project.id) };
}
async function publishCapture(native: CapturedChange) {
  const queued = await enqueueSyncQueueOperation(native);
  const run = await beginSyncQueueRun(checkpointScope(), native.operationId, queued.revision);
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
  const attemptId = crypto.randomUUID();
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
    recordKey: 'records/dependency.json',
    objects: [],
  });
  const { result } = await commitVerifiedOutgoingResult(prepared, attempt);
  expect(await completeSyncQueueRun(run, { kind: 'verified', result })).toMatchObject({
    status: 'published',
  });
}
async function assertParentDependency(
  data: Awaited<ReturnType<typeof pendingParentWithDependency>>
) {
  const parent = await forceCheckpoint(data.pending);
  const dependency = captures().find((row) => row.rootId === data.mediaId);
  if (parent?.phase !== 'native' || parent.change.kind !== 'video-project' || !dependency)
    throw new Error('Expected dependency and parent checkpoint captures');
  expect(parent.change.rows.mediaDependencies).toEqual([
    { mediaId: data.mediaId, generation: dependency.generation, basis: [dependency.operationId] },
  ]);
  expect(dependency.change).toMatchObject({ rows: { media: { tags: ['pending-native-edit'] } } });
  return dependency;
}

it('captures a pending dependency genesis before its parent and binds the exact head', async () => {
  const data = await pendingParentWithDependency();
  expect(captures()).toHaveLength(0);
  await assertParentDependency(data);
  expect(
    [...table('sync_capture').values()]
      .map(parseSyncCaptureRecord)
      .filter((row) => row?.kind === 'pending-checkpoint')
  ).toHaveLength(0);
});

it('captures a dirty dependency after its old published head before its parent', async () => {
  const data = await pendingParentWithDependency();
  const dependencyPending = await pendingSelection('media', data.mediaId);
  const first = await forceCheckpoint(dependencyPending);
  if (first?.phase !== 'native') throw new Error('Missing first dependency capture');
  await publishCapture(first);
  const oldPublished = structuredClone(table('sync_capture').get(first.key));
  await dirtyDependency(data.mediaId);
  const dependency = await assertParentDependency(data);
  expect(dependency.basis).toEqual([first.operationId]);
  expect(dependency.generation).toBe(first.generation + 1);
  expect(table('sync_capture').get(first.key)).toEqual(oldPublished);
});

it('preserves both pending checkpoints while a dependency predecessor is unpublished', async () => {
  const data = await pendingParentWithDependency();
  const first = await forceCheckpoint(await pendingSelection('media', data.mediaId));
  if (first?.phase !== 'native') throw new Error('Missing busy dependency capture');
  await dirtyDependency(data.mediaId);
  const before = structuredClone(fixture.rows);
  await expect(forceCheckpoint(data.pending)).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
  await publishCapture(first);
  await assertParentDependency(data);
});

it('rolls back dependency checkpoint consumption when its parent capture fails', async () => {
  const data = await pendingParentWithDependency();
  const before = structuredClone(fixture.rows);
  captureWritesBeforeFailure = 2;
  await expect(forceCheckpoint(data.pending)).rejects.toMatchObject({ name: 'QuotaExceededError' });
  expect(fixture.rows).toEqual(before);
  await assertParentDependency(data);
});

it('keeps a newer dependency checkpoint when an old selection retries', async () => {
  const data = await pendingParentWithDependency();
  const stale = await pendingSelection('media', data.mediaId);
  await dirtyDependency(data.mediaId);
  const current = await pendingSelection('media', data.mediaId);
  expect(current.revision).not.toBe(stale.revision);
  const before = structuredClone(fixture.rows);
  expect(await forceCheckpoint(stale)).toBeNull();
  expect(fixture.rows).toEqual(before);
  await assertParentDependency(data);
});

it('refuses missing native roots before creating deferred checkpoint identities', async () => {
  table('sync_capture').set('profile', { ...profile(), checkpointIntervalMs: 300000 });
  for (const capture of [
    captureVideoProjectInTransaction,
    captureImageInTransaction,
    captureMediaInTransaction,
  ]) {
    const before = structuredClone(fixture.rows);
    await expect(
      runWithIndexedDbMutation(async (db) => {
        const { tx } = createProjectMutationStores(db, { checkpointAdmission: true });
        try {
          await capture(tx, 'missing-native-root');
          await tx.done;
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      })
    ).rejects.toThrow();
    expect(fixture.rows).toEqual(before);
  }
});

it('forces Scenario dependency genesis despite an explicit checkpoint period', async () => {
  const { createGuideProject } = await import('../../../features/scenario/project/factories');
  const { createScenarioProjectEntry } = await import('../scenario/projects/entry');
  const scenario = createScenarioProjectEntry({
    project: createGuideProject('Source', 'scenario-source', 1),
    existing: undefined,
    updatedAt: 1,
  });
  table('scenario_projects').set(scenario.id, scenario);
  fixture.rows.set('scenario_exports', new Map());
  fixture.rows.set('scenario_step_editor_documents', new Map());
  table('sync_capture').set('profile', { ...profile(), checkpointIntervalMs: 300000 });
  const project = createVideoProject({ id: projectId });
  project.source = { kind: 'scenario', scenarioProjectId: scenario.id };
  await saveVideoProject(project, { expectedWorkspaceRevision: null });
  const parent = await forceCheckpoint(await pendingSelection('video-project', projectId));
  const dependency = captures().find((row) => row.rootKind === 'scenario-project');
  if (parent?.phase !== 'native' || parent.change.kind !== 'video-project' || !dependency)
    throw new Error('Expected Scenario dependency and parent');
  expect(parent.change.rows.rootDependencies).toEqual([
    {
      rootKind: 'scenario-project',
      rootId: scenario.id,
      generation: dependency.generation,
      basis: [dependency.operationId],
      childIds: [],
    },
  ]);
});

it('captures a pending dependency after a published legacy publication-keyed head', async () => {
  const data = await publishDependency();
  const legacy = captures().find((row) => row.rootId === data.mediaId);
  if (!legacy || !legacy.publicationId) throw new Error('Missing legacy publication capture');
  await publishCapture(legacy);
  const immutable = structuredClone(table('sync_capture').get(legacy.key));
  table('sync_capture').set('profile', { ...profile(), checkpointIntervalMs: 300000 });
  await dirtyDependency(data.mediaId);
  await saveVideoProject(data.project, { expectedWorkspaceRevision: null });
  const pending = await pendingSelection('video-project', data.project.id);
  const dependency = await assertParentDependency({ ...data, pending });
  expect(dependency.basis).toEqual([legacy.operationId]);
  expect(table('sync_capture').get(legacy.key)).toEqual(immutable);
});

it('captures a legacy pending dependency from an ordinary publication parent transaction', async () => {
  const data = await publishDependency();
  const legacy = captures().find((row) => row.rootId === data.mediaId);
  if (!legacy) throw new Error('Missing legacy source capture');
  await publishCapture(legacy);
  table('sync_capture').set('profile', { ...profile(), checkpointIntervalMs: 300000 });
  await dirtyDependency(data.mediaId);
  await saveVideoProject(data.project, { expectedWorkspaceRevision: null });
  const parent = await publicationCapture('ordinary-parent-checkpoint');
  const dependency = captures().find((row) => row.rootId === data.mediaId);
  if (parent.phase !== 'native' || parent.change.kind !== 'video-project' || !dependency)
    throw new Error('Expected parent and current dependency capture');
  expect(parent.change.rows.mediaDependencies).toEqual([
    { mediaId: data.mediaId, generation: dependency.generation, basis: [dependency.operationId] },
  ]);
  expect(dependency.basis).toEqual([legacy.operationId]);
});

it(
  'merges existing Library image metadata into pending work while keeping source and ' +
    'lifecycle capture immediate',
  async () => {
    const { createMediaLibraryEntry } = await import('../projects/index.test-support');
    const media = createMediaLibraryEntry({
      id: 'library-image-checkpoint',
      kind: 'screenshot',
      source: { kind: 'screenshot' },
      mimeType: 'image/png',
      size: 8,
      blob: new Blob(['original'], { type: 'image/png' }),
      workspaceRevision: 0,
      imageContentState: 'original',
      lifecycle: { savedAt: 1, updatedAt: 1, storageClass: 'library' },
    });
    table('sync_capture').set('profile', { ...profile(), checkpointIntervalMs: 300000 });
    table('media_library').set(media.id, media);
    const capture = (mode: 'source' | 'edit' | 'metadata' | 'lifecycle') =>
      runWithIndexedDbMutation(async (db) => {
        const { tx } = createProjectMutationStores(db, { checkpointAdmission: true });
        try {
          const result =
            mode === 'edit'
              ? await captureImageInTransaction(tx, media.id)
              : await captureMediaInTransaction(
                  tx,
                  media.id,
                  mode === 'lifecycle' ? { checkpoint: 'lifecycle' } : {}
                );
          await tx.done;
          return result;
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      });
    const source = await capture('source');
    expect(source).toMatchObject({
      phase: 'native',
      generation: 1,
      change: { kind: 'image', rows: { workspace: null } },
    });
    table('media_library').set(media.id, { ...media, tags: ['local-edit'] });
    expect(await capture('edit')).toBeNull();
    const pending = await pendingSelection('media', media.id);
    table('media_library').set(media.id, {
      ...media,
      tags: ['local-edit'],
      filename: 'Renamed locally.png',
    });
    expect(await capture('metadata')).toBeNull();
    const renamed = await pendingSelection('media', media.id);
    expect(renamed.createdAt).toBe(pending.createdAt);
    expect(renamed.dueAt).toBe(pending.dueAt);
    expect(captures()).toHaveLength(1);
    const { parseMediaLibraryEntry } = await import('../media-library/read-guards');
    const latestMedia = parseMediaLibraryEntry(table('media_library').get(media.id));
    if (!latestMedia) throw new Error('Missing edited native image');
    table('media_library').set(media.id, { ...latestMedia, workspaceRevision: 1 });
    table('aggregate_presentations').set(JSON.stringify(['image', media.id]), {
      aggregateId: media.id,
      aggregateKind: 'image',
      presentationRevision: 0,
      thumbnailBlob: new Blob(['old-thumbnail'], { type: 'image/png' }),
      updatedAt: 1,
    });
    const forced = await capture('lifecycle');
    expect(forced).toMatchObject({
      phase: 'native',
      generation: 2,
      basis: [source?.operationId],
      change: { rows: { media: { filename: 'Renamed locally.png', tags: ['local-edit'] } } },
    });
    if (forced?.phase !== 'native' || forced.change.kind !== 'image')
      throw new Error('Expected lifecycle image checkpoint');
    expect(forced.change.rows.presentation).toBeNull();
    const { freezeImageInTransaction, digestCapturedImageRows } = await import('./image-snapshot');
    const native = await runWithIndexedDbMutation(async (db) => {
      const read = db.transaction(
        ['media_library', 'image_workspaces', 'aggregate_presentations', 'asset_refs'],
        'readonly'
      );
      const rows = await freezeImageInTransaction(read, media.id);
      await read.done;
      return rows;
    });
    expect(native.presentation?.presentationRevision).toBe(0);
    expect(table('sync_capture').get(JSON.stringify(['root-state', forced.rootKey]))).toMatchObject(
      {
        nativeDigest: digestCapturedImageRows(native),
      }
    );
    expect(
      [...table('sync_capture').values()]
        .map(parseSyncCaptureRecord)
        .filter((row) => row?.kind === 'pending-checkpoint')
    ).toHaveLength(0);
  }
);

it('captures a pending review source before binding the review checkpoint', async () => {
  const data = await pendingParentWithDependency();
  const { workspace: template } = await import('../review-workspaces/backup-restore.test-support');
  const { materializeVideoWorkspaceProject } =
    await import('../review-workspaces/project-metadata');
  const review = materializeVideoWorkspaceProject(
    {
      ...structuredClone(template),
      aggregateId: data.mediaId,
      sourceAssetId: data.entry.assetId,
      source: { ...template.source, mimeType: data.entry.mimeType, size: data.entry.size },
      history: [],
      cursor: 0,
    },
    'Review pending source'
  );
  table('video_workspaces').set(review.aggregateId, review);
  await runWithIndexedDbMutation(async (db) => {
    const { tx } = createProjectMutationStores(db, { checkpointAdmission: true });
    try {
      await captureVideoReviewInTransaction(tx, review.aggregateId);
      await tx.done;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
  const parent = await forceCheckpoint(await pendingSelection('video-review', review.aggregateId));
  const dependency = captures().find(
    (row) => row.rootKind === 'media' && row.rootId === data.mediaId
  );
  if (parent?.phase !== 'native' || parent.change.kind !== 'video-review' || !dependency)
    throw new Error('Expected review and source checkpoints');
  expect(parent.change.mediaDependencies).toEqual([
    { mediaId: data.mediaId, generation: dependency.generation, basis: [dependency.operationId] },
  ]);
  expect(
    [...table('sync_capture').values()]
      .map(parseSyncCaptureRecord)
      .filter(
        (row) =>
          row?.kind === 'pending-checkpoint' &&
          row.rootId === data.mediaId &&
          row.rootKind === 'media'
      )
  ).toHaveLength(0);
});

it('moves a pending parent to Trash while its dirty dependency has an unpublished predecessor', async () => {
  const { moveStoredItemsToTrash, restoreStoredItemsFromTrash } =
    await import('../library-lifecycle/trash');
  const data = await pendingParentWithDependency();
  const previous = await forceCheckpoint(await pendingSelection('media', data.mediaId));
  if (previous?.phase !== 'native') throw new Error('Expected unpublished dependency checkpoint');
  await dirtyDependency(data.mediaId, 'newer-pending-edit');
  const before = structuredClone(fixture.rows);
  try {
    await moveStoredItemsToTrash([{ kind: 'video-project', id: data.project.id }], Date.now());
  } catch (error) {
    // Establish the actual refusal and rollback before retaining the failing acceptance proof.
    expect(fixture.rows).toEqual(before);
    expect(currentProject().lifecycle?.trashedAt).toBeUndefined();
    expect(table('sync_capture').get(previous.key)).toEqual(previous);
    throw error;
  }
  expect(currentProject().lifecycle?.trashedAt).toBeDefined();
  expect(table('sync_capture').get(previous.key)).toEqual(previous);
  const dependency = captures().find(
    (row) => row.rootId === data.mediaId && row.generation === previous.generation + 1
  );
  const parent = captures().find((row) => row.rootKind === 'video-project');
  if (!dependency || parent?.change.kind !== 'video-project')
    throw new Error('Expected immediate lifecycle checkpoint closure');
  expect(dependency.basis).toEqual([previous.operationId]);
  expect(dependency.change).toMatchObject({ rows: { media: { tags: ['newer-pending-edit'] } } });
  expect(parent.change.rows.mediaDependencies).toEqual([
    { mediaId: data.mediaId, generation: dependency.generation, basis: [dependency.operationId] },
  ]);
  await dirtyDependency(data.mediaId, 'edited-before-restore');
  await restoreStoredItemsFromTrash([{ kind: 'video-project', id: data.project.id }], Date.now());
  expect(currentProject().lifecycle).not.toHaveProperty('trashedAt');
  expect(table('sync_capture').get(previous.key)).toEqual(previous);
  expect(table('sync_capture').get(dependency.key)).toEqual(dependency);
  const restoredDependency = captures().find(
    (row) => row.rootId === data.mediaId && row.generation === dependency.generation + 1
  );
  const restoredParent = captures().find(
    (row) => row.rootKind === 'video-project' && row.generation === parent.generation + 1
  );
  if (!restoredDependency || restoredParent?.change.kind !== 'video-project')
    throw new Error('Expected immediate restore closure');
  expect(restoredDependency.basis).toEqual([dependency.operationId]);
  expect(restoredParent.basis).toEqual([parent.operationId]);
  expect(restoredParent.change.rows.mediaDependencies).toEqual([
    {
      mediaId: data.mediaId,
      generation: restoredDependency.generation,
      basis: [restoredDependency.operationId],
    },
  ]);
  expect(
    [...table('sync_capture').values()]
      .map(parseSyncCaptureRecord)
      .filter((row) => row?.kind === 'pending-checkpoint')
  ).toHaveLength(0);
});

it.each([
  { mode: 'checkpoint', stale: false },
  { mode: 'checkpoint', stale: true },
  { mode: 'lifecycle', stale: false },
  { mode: 'lifecycle', stale: true },
] as const)(
  'selects only revision-matched Montage presentation for checkpoint or lifecycle publication: $mode stale=$stale',
  async ({ mode, stale }) => {
    table('sync_capture').set('profile', { ...profile(), checkpointIntervalMs: 300000 });
    const saved = await saveVideoProject(
      createVideoProject({ id: projectId, name: 'Latest Montage content' }),
      { expectedWorkspaceRevision: null }
    );
    const revision = saved.workspaceRevision;
    if (revision === undefined || revision < 1)
      throw new Error('Expected accepted native project revision');
    const key = JSON.stringify(['video-project', projectId]);
    const presentation = {
      aggregateKind: 'video-project',
      aggregateId: projectId,
      presentationRevision: stale ? revision - 1 : revision,
      previewBlob: new Blob(['preview'], { type: 'image/png' }),
      thumbnailBlob: new Blob(['thumbnail'], { type: 'image/png' }),
      updatedAt: 1,
    };
    table('aggregate_presentations').set(key, presentation);
    const pending = await pendingSelection('video-project', projectId);
    if (mode === 'checkpoint') await forceCheckpoint(pending);
    else {
      const { moveStoredItemsToTrash } = await import('../library-lifecycle/trash');
      await moveStoredItemsToTrash([{ kind: 'video-project', id: projectId }], 200);
    }
    const captured = captures().find((row) => row.rootKind === 'video-project');
    if (captured?.change.kind !== 'video-project') throw new Error('Expected Montage checkpoint');
    expect(captured.change.rows.project.project.name).toBe('Latest Montage content');
    expect(captured.change.rows.project.workspaceRevision).toBe(revision);
    expect(captured.change.rows.presentation).toEqual(stale ? null : presentation);
    expect(table('aggregate_presentations').get(key)).toEqual(presentation);
    const native = table('aggregate_presentations').get(key);
    if (
      !native ||
      typeof native !== 'object' ||
      !('thumbnailBlob' in native) ||
      !(native.thumbnailBlob instanceof Blob)
    )
      throw new Error('Missing retained thumbnail');
    expect(await native.thumbnailBlob.text()).toBe('thumbnail');
    expect(table('sync_capture').has(pending.key)).toBe(false);
    expect(currentProject().workspaceRevision).toBe(revision);
    if (mode === 'lifecycle') expect(currentProject().lifecycle?.trashedAt).toBeDefined();
  }
);

it.each([0, 300000])(
  'captures an actual initial Library screenshot immediately with interval %s',
  async (intervalMs) => {
    const { saveScreenshotMediaAsset } = await import('../media-library/index.screenshots');
    table('sync_capture').set('profile', { ...profile(), checkpointIntervalMs: intervalMs });
    const original = new Blob(['immutable-original-image'], { type: 'image/png' });
    const saved = await saveScreenshotMediaAsset({
      id: 'actual-initial-image',
      filename: 'initial.png',
      blob: original,
      storageClass: 'library',
    });
    expect(captures()).toHaveLength(1);
    expect(captures()[0]).toMatchObject({
      rootId: saved.id,
      generation: 1,
      change: { kind: 'image', rows: { workspace: null, media: { workspaceRevision: 0 } } },
    });
    expect(
      [...table('sync_capture').values()]
        .map(parseSyncCaptureRecord)
        .filter((row) => row?.kind === 'pending-checkpoint')
    ).toHaveLength(0);
    expect(await saved.blob?.text()).toBe(await original.text());
  }
);

it(
  'coalesces ten real image workspace journals and replays after their latest due ' +
    'checkpoint without new intent',
  async () => {
    const { saveScreenshotMediaAsset } = await import('../media-library/index.screenshots');
    const { imageWorkspacePublicationAdapter } = await import('../image-aggregates/mutations');
    const { createEditorDocumentFixture } =
      await import('../../../editor/document/page-session/document.test-support');
    const { createPersistedEditorDocumentFixture } =
      await import('../document-assets/test-support');
    const { parseImageWorkspaceEntry } = await import('../image-workspaces/parser');
    const original = new Blob(['immutable-original-image'], { type: 'image/png' });
    const saved = await saveScreenshotMediaAsset({
      id: 'journal-autosave-image',
      filename: 'original.png',
      blob: original,
      storageClass: 'library',
    });
    const source = captures()[0];
    if (!source) throw new Error('Missing initial native source capture');
    await publishCapture(source);
    const ref: AssetRef = {
      assetId: 'reused-journal-source',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'objects/reused-journal-source' },
      mimeType: 'image/png',
      size: original.size,
      sha256: null,
    };
    const initial = createPersistedEditorDocumentFixture(
      createEditorDocumentFixture(),
      ref.assetId
    );
    table('asset_refs').set(ref.assetId, ref);
    table('asset_owners').set(JSON.stringify(['image-workspace', saved.id, 'source-image']), {
      assetId: ref.assetId,
      ownerKind: 'image-workspace',
      ownerId: saved.id,
      role: 'source-image',
    });
    table('image_workspaces').set(saved.id, {
      aggregateId: saved.id,
      document: initial,
      revision: 1,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      sourceUrl: null,
      sourceTitle: null,
    });
    table('media_library').set(saved.id, { ...saved, workspaceRevision: 1 });
    const operationCount = () =>
      [...table('sync_capture').values()]
        .map(parseSyncCaptureRecord)
        .filter((row) => row?.kind === 'sync-operation').length;
    const makeJournal = (index: number) => ({
      journalId: `real-image-workspace-journal-${index}`,
      domain: 'image-workspace',
      createdAt: 1,
      assetRefs: [],
      payload: {
        aggregateId: saved.id,
        expectedRevision: index,
        requireExistingRoot: true,
        document: { ...initial, frame: { ...initial.frame, paddingLeft: index } },
        refs: [ref],
      },
    });
    // A legacy accepted journal retains its immutable publication receipt after policy changes.
    await imageWorkspacePublicationAdapter.publish(makeJournal(1));
    await runWithIndexedDbMutation(async (db) => {
      const { tx } = createProjectMutationStores(db, { checkpointAdmission: true });
      try {
        await captureImageInTransaction(tx, saved.id, {
          publicationId: makeJournal(1).journalId,
          checkpoint: 'freeze',
        });
        await tx.done;
      } catch (error) {
        return abortIndexedDbMutation(tx, error);
      }
    });
    const legacy = captures().at(-1);
    if (!legacy) throw new Error('Missing legacy image journal capture');
    expect(legacy.publicationId).toBe(makeJournal(1).journalId);
    await publishCapture(legacy);
    table('sync_capture').set('profile', { ...profile(), checkpointIntervalMs: 300000 });
    const baselineCount = operationCount();
    let firstPending: Awaited<ReturnType<typeof pendingSelection>> | undefined;
    for (let index = 2; index <= 11; index++) {
      await imageWorkspacePublicationAdapter.publish(makeJournal(index));
      expect(parseImageWorkspaceEntry(table('image_workspaces').get(saved.id))).toMatchObject({
        revision: index + 1,
        document: { frame: { paddingLeft: index } },
      });
      const pending = await pendingSelection('media', saved.id);
      firstPending ??= pending;
      expect(pending.createdAt).toBe(firstPending.createdAt);
      expect(pending.dueAt).toBe(firstPending.dueAt);
      expect(operationCount()).toBe(baselineCount);
    }
    const selected = await pendingSelection('media', saved.id);
    const frozen = await runWithIndexedDbMutation(async (db) => {
      const { tx } = createProjectMutationStores(db, { checkpointAdmission: true });
      try {
        const result = await captureRootCheckpointInTransaction(tx, selected, {
          now: selected.dueAt,
        });
        await tx.done;
        return result;
      } catch (error) {
        return abortIndexedDbMutation(tx, error);
      }
    });
    expect(frozen).toMatchObject({
      rootId: saved.id,
      generation: 3,
      change: {
        kind: 'image',
        rows: {
          workspace: { revision: 12, document: { frame: { paddingLeft: 11 } } },
          presentation: null,
        },
      },
    });
    expect(operationCount()).toBe(baselineCount + 1);
    const consumed = structuredClone(fixture.rows);
    await imageWorkspacePublicationAdapter.publish(makeJournal(11));
    expect(fixture.rows).toEqual(consumed);
    const replay = await runWithIndexedDbMutation(async (db) => {
      const { tx } = createProjectMutationStores(db, { checkpointAdmission: true });
      try {
        const result = await captureImageInTransaction(tx, saved.id, {
          publicationId: makeJournal(1).journalId,
        });
        await tx.done;
        return result;
      } catch (error) {
        return abortIndexedDbMutation(tx, error);
      }
    });
    expect(replay).toMatchObject({
      generation: legacy.generation,
      operationId: legacy.operationId,
      publicationId: legacy.publicationId,
    });
    expect(fixture.rows).toEqual(consumed);
    expect(
      [...table('sync_capture').values()]
        .map(parseSyncCaptureRecord)
        .filter((row) => row?.kind === 'pending-checkpoint')
    ).toHaveLength(0);
    expect(table('media_library').size).toBe(2);
    const { parseMediaLibraryEntry } = await import('../media-library/read-guards');
    const current = parseMediaLibraryEntry(table('media_library').get(saved.id));
    expect(current?.filename).toBe('original.png');
    expect(await current?.blob?.text()).toBe(await original.text());
    expect(table('asset_refs').size).toBe(1);
  }
);

async function imageReceiptWriter(source: 'screenshot' | 'project-asset' = 'screenshot') {
  const assets = await import('../assets');
  const documents = await import('../document-assets');
  const { createEditorDocumentFixture } =
    await import('../../../editor/document/page-session/document.test-support');
  const { createPersistedEditorDocumentFixture } = await import('../document-assets/test-support');
  const { saveScreenshotMediaAsset } = await import('../media-library/index.screenshots');
  const mutations = await import('../image-aggregates/mutations');
  const original = new Blob(['image-receipt-original'], { type: 'image/png' });
  const { createMediaLibraryEntry, createProjectAssetEntry } =
    await import('../projects/index.test-support');
  const media =
    source === 'screenshot'
      ? await saveScreenshotMediaAsset({
          id: 'image-native-receipt',
          filename: 'receipt.png',
          blob: original,
          storageClass: 'library',
        })
      : createMediaLibraryEntry({
          id: 'project-asset:imported-image-native-receipt',
          source: { kind: 'project-asset', projectAssetId: 'imported-image-native-receipt' },
          filename: 'imported.png',
          originalFilename: 'imported.png',
          size: original.size,
          width: 100,
          height: 80,
          workspaceRevision: 0,
          lifecycle: { storageClass: 'library', updatedAt: 1, savedAt: 1 },
        });
  const ref: AssetRef = {
    assetId: 'receipt-source',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/receipt-source' },
    mimeType: 'image/png',
    size: original.size,
    sha256: null,
  };
  const document = createEditorDocumentFixture();
  table('asset_refs').set(ref.assetId, ref);
  if (media.source.kind === 'project-asset') {
    table('project_assets').set(
      media.source.projectAssetId,
      createProjectAssetEntry({
        id: media.source.projectAssetId,
        assetId: ref.assetId,
        size: ref.size,
        mimeType: ref.mimeType,
      })
    );
    table('asset_owners').set(
      JSON.stringify(['project-asset', media.source.projectAssetId, 'body']),
      {
        assetId: ref.assetId,
        ownerKind: 'project-asset',
        ownerId: media.source.projectAssetId,
        role: 'body',
      }
    );
    table('media_library').set(media.id, media);
    const initial = await runWithIndexedDbMutation(async (db) => {
      const { tx } = createProjectMutationStores(db);
      const captured = await captureMediaInTransaction(tx, media.id, { checkpoint: 'freeze' });
      await tx.done;
      return captured;
    });
    if (initial?.phase !== 'native') throw new Error('Imported source capture is missing');
    await publishCapture(initial);
  }
  table('asset_owners').set(JSON.stringify(['image-workspace', media.id, 'source-image']), {
    assetId: ref.assetId,
    ownerKind: 'image-workspace',
    ownerId: media.id,
    role: 'source-image',
  });
  table('media_library').set(media.id, { ...media, workspaceRevision: 1 });
  table('image_workspaces').set(media.id, {
    aggregateId: media.id,
    document: createPersistedEditorDocumentFixture(document, ref.assetId),
    revision: 1,
    createdAt: media.createdAt,
    updatedAt: media.updatedAt,
    sourceTitle: null,
    sourceUrl: null,
  });
  table('sync_capture').set('profile', { ...profile(), checkpointIntervalMs: 300000 });
  vi.spyOn(documents, 'preparePersistedEditorDocument').mockImplementation(async (input) => ({
    document: createPersistedEditorDocumentFixture(input, ref.assetId),
    refs: [ref],
    objects: [],
    runtimeAssetsByUrl: new Map([['runtime-source', ref]]),
  }));
  const journal = vi
    .spyOn(assets, 'createAssetPublicationJournal')
    .mockImplementation(async (args) => ({
      assetRefs: args.assetRefs,
      createdAt: 1,
      domain: args.domain,
      journalId: crypto.randomUUID(),
      payload: args.payload,
    }));
  vi.spyOn(assets, 'recoverStandaloneAssetPublications').mockResolvedValue(0);
  vi.spyOn(assets, 'releaseAssetReadyProtection').mockResolvedValue(undefined);
  vi.spyOn(assets, 'publishReadyJournalWithRetry').mockImplementation(async (ready, publish) => {
    await publish(ready);
  });
  const save = (revision: number, padding: number) =>
    mutations.commitImageWorkspace({
      aggregateId: media.id,
      expectedRevision: revision,
      requireExistingRoot: true,
      reusableAssetsByRuntimeUrl: new Map([[document.sourceImageData, ref]]),
      document: { ...document, frame: { ...document.frame, paddingLeft: padding } },
    });
  return { media, original, document, ref, journal, save, mutations };
}

it(
  'defers a real imported project-asset Image workspace save without changing its ' +
    'original child ref or body owner',
  async () => {
    const f = await imageReceiptWriter('project-asset');
    if (f.media.source.kind !== 'project-asset') throw new Error('Expected imported Image fixture');
    const childId = f.media.source.projectAssetId;
    const child = structuredClone(table('project_assets').get(childId));
    const owners = structuredClone(table('asset_owners'));
    const refs = structuredClone(table('asset_refs'));
    const previousCaptures = structuredClone(table('sync_capture'));
    const saved = await f.save(1, 10);
    expect(table('image_workspaces').get(f.media.id)).toMatchObject({ revision: 2 });
    expect(table('media_library').get(f.media.id)).toMatchObject({
      source: f.media.source,
      workspaceRevision: 2,
    });
    expect(table('project_assets').get(childId)).toEqual(child);
    expect(table('asset_refs')).toEqual(refs);
    expect(table('asset_owners')).toEqual(owners);
    const pending = await pendingSelection('media', f.media.id);
    expect(saved.checkpointReceipt).toEqual({
      rootKind: 'media',
      rootId: f.media.id,
      revision: pending.revision,
    });
    expect(
      [...table('sync_capture').values()].filter((raw) => {
        const row = parseSyncCaptureRecord(raw);
        return row?.kind === 'sync-operation';
      })
    ).toEqual(
      [...previousCaptures.values()].filter((raw) => {
        const row = parseSyncCaptureRecord(raw);
        return row?.kind === 'sync-operation';
      })
    );
    const frozen = await runWithIndexedDbMutation(async (db) => {
      const { tx } = createProjectMutationStores(db);
      const capture = await captureRootCheckpointInTransaction(tx, pending, { now: pending.dueAt });
      await tx.done;
      return capture;
    });
    expect(frozen?.phase).toBe('native');
    if (frozen?.phase !== 'native' || frozen.change.kind !== 'image')
      throw new Error('Expected complete Image capture');
    expect(frozen.change.rows.media.source).toEqual(f.media.source);
    expect(frozen.change.rows.workspace?.revision).toBe(2);
    expect(frozen.change.rows.originalRef).toEqual(f.ref);
    expect(table('project_assets').get(childId)).toEqual(child);
    expect(table('asset_refs')).toEqual(refs);
  }
);

it('returns each real image native save receipt without persisting it in rows or journal payloads', async () => {
  const f = await imageReceiptWriter();
  const first = await f.save(1, 10);
  const firstPending = await pendingSelection('media', f.media.id);
  expect(first.checkpointReceipt).toEqual({
    rootKind: 'media',
    rootId: f.media.id,
    revision: firstPending.revision,
  });
  const second = await f.save(2, 20);
  const secondPending = await pendingSelection('media', f.media.id);
  expect(second.checkpointReceipt).toEqual({
    rootKind: 'media',
    rootId: f.media.id,
    revision: secondPending.revision,
  });
  expect(second.checkpointReceipt?.revision).not.toBe(first.checkpointReceipt?.revision);
  expect(table('image_workspaces').get(f.media.id)).not.toHaveProperty('checkpointReceipt');
  expect(table('media_library').get(f.media.id)).not.toHaveProperty('checkpointReceipt');
  for (const [input] of f.journal.mock.calls)
    expect(input.payload).not.toHaveProperty('checkpointReceipt');
  const { parseMediaLibraryEntry } = await import('../media-library/read-guards');
  const stored = parseMediaLibraryEntry(table('media_library').get(f.media.id));
  expect(await stored?.blob?.text()).toBe(await f.original.text());
  expect(table('asset_refs').get(f.ref.assetId)).toEqual(f.ref);
  expect(table('asset_refs').size).toBe(1);
});

it('does not acknowledge an image checkpoint receipt before native transaction commit', async () => {
  const f = await imageReceiptWriter();
  let commit!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((resolve) => {
    commit = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const original = fixture.database.transaction.bind(fixture.database);
  vi.spyOn(fixture.database, 'transaction').mockImplementation((stores, mode) => {
    const tx = original(stores, mode);
    if (mode !== 'readwrite' || !stores.includes('image_workspaces')) return tx;
    return {
      abort: () => tx.abort(),
      objectStore: tx.objectStore.bind(tx),
      get done() {
        entered();
        return held.then(() => tx.done);
      },
    };
  });
  let acknowledged = false;
  const saving = f.save(1, 10).then((result) => {
    acknowledged = true;
    return result;
  });
  await ready;
  expect(acknowledged).toBe(false);
  expect(await fixture.database.get('image_workspaces', f.media.id)).toMatchObject({ revision: 1 });
  commit();
  const saved = await saving;
  expect(saved.checkpointReceipt?.revision).toBe(
    (await pendingSelection('media', f.media.id)).revision
  );
});

it(
  'rejects image capture failure and stale CAS without acknowledging or retaining an ' +
    'uncommitted receipt',
  async () => {
    const f = await imageReceiptWriter();
    const before = structuredClone(fixture.rows);
    failCaptureWrite = true;
    await expect(f.save(1, 10)).rejects.toThrow();
    expect(fixture.rows).toEqual(before);
    failCaptureWrite = false;
    const saved = await f.save(1, 10);
    expect(saved.checkpointReceipt).toBeDefined();
    const accepted = structuredClone(fixture.rows);
    await expect(f.save(1, 20)).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
    expect(fixture.rows).toEqual(accepted);
  }
);

it(
  'retains the document receipt across presentation, omits replay receipt, and ' +
    'refuses old replay after a new edit',
  async () => {
    const f = await imageReceiptWriter();
    const saved = await f.save(1, 10);
    const journal = await f.journal.mock.results[0]!.value;
    await f.mutations.commitImagePresentation({
      aggregateId: f.media.id,
      expectedWorkspaceRevision: saved.revision,
      previewBlob: new Blob(['new-preview'], { type: 'image/png' }),
      thumbnailBlob: new Blob(['new-thumbnail'], { type: 'image/png' }),
    });
    const afterPresentation = await pendingSelection('media', f.media.id);
    expect(afterPresentation.revision).toBe(saved.checkpointReceipt?.revision);
    const beforeReplay = structuredClone(fixture.rows);
    f.journal.mockResolvedValueOnce(journal);
    const replay = await f.save(1, 10);
    expect(replay).not.toHaveProperty('checkpointReceipt');
    expect(fixture.rows).toEqual(beforeReplay);
    const authored = await f.save(saved.revision, 20);
    const later = await pendingSelection('media', f.media.id);
    expect(later.revision).toBe(authored.checkpointReceipt?.revision);
    expect(later.revision).not.toBe(saved.checkpointReceipt?.revision);
    const beforeStaleReplay = structuredClone(fixture.rows);
    f.journal.mockResolvedValueOnce(journal);
    await expect(f.save(1, 10)).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
    expect(fixture.rows).toEqual(beforeStaleReplay);
  }
);

it('omits an image native receipt when canonical source admission creates its first immediate capture', async () => {
  const f = await imageReceiptWriter();
  table('sync_capture').clear();
  table('sync_capture').set('profile', { ...profile(), checkpointIntervalMs: 300000 });
  const initial = await f.save(1, 10);
  expect(initial).not.toHaveProperty('checkpointReceipt');
  expect(captures()).toHaveLength(1);
  expect(captures()[0]).toMatchObject({ generation: 1, publicationId: expect.any(String) });
});

it.each(['image', 'review', 'scenario', 'montage'] as const)(
  'uses the legacy five-minute default in the real %s writer before startup maintenance',
  async (kind) => {
    const { EXPECTED_STORES } = await import('../infrastructure/indexed-db/core.stores');
    for (const name of EXPECTED_STORES) {
      if (!fixture.rows.has(name)) fixture.rows.set(name, new Map());
    }
    const legacy = profile();
    let rootKind: 'media' | 'video-review' | 'scenario-project' | 'video-project';
    let rootId: string;
    let write: () => Promise<unknown>;
    if (kind === 'image') {
      const f = await imageReceiptWriter();
      rootKind = 'media';
      rootId = f.media.id;
      write = () => f.save(1, 10);
    } else if (kind === 'review') {
      const opfs = await import('../assets/opfs-store');
      vi.spyOn(opfs, 'listReadyJournals').mockResolvedValue([]);
      const data = await publishDependency();
      const { workspace: template } =
        await import('../review-workspaces/backup-restore.test-support');
      const { materializeVideoWorkspaceProject } =
        await import('../review-workspaces/project-metadata');
      const { saveVideoWorkspaceSnapshot } = await import('../review-workspaces/store');
      const review = materializeVideoWorkspaceProject(
        {
          ...structuredClone(template),
          aggregateId: data.mediaId,
          sourceAssetId: data.entry.assetId,
          source: { ...template.source, mimeType: data.entry.mimeType, size: data.entry.size },
          history: [],
          cursor: 0,
        },
        'Legacy Review'
      );
      table('video_workspaces').set(review.aggregateId, review);
      rootKind = 'video-review';
      rootId = review.aggregateId;
      write = () =>
        saveVideoWorkspaceSnapshot({
          aggregateId: review.aggregateId,
          expectedRevision: review.revision,
          expectedDraftRevision: null,
          expectedSourceAssetId: review.sourceAssetId,
          workspace: { ...review, updatedAt: review.updatedAt + 1 },
          draft: null,
        });
    } else if (kind === 'scenario') {
      const { createGuideProject } = await import('../../../features/scenario/project/factories');
      const { saveScenarioProject } = await import('../scenario/projects/project');
      const assets = await import('../assets');
      vi.spyOn(assets, 'recoverStandaloneAssetPublications').mockResolvedValue(0);
      const project = createGuideProject('Legacy Scenario', 'legacy-default-scenario', 1);
      rootKind = 'scenario-project';
      rootId = project.id;
      write = () =>
        saveScenarioProject(project, { expectedRevision: null, storageClass: 'library' });
    } else {
      const project = createVideoProject({ id: 'legacy-default-montage' });
      rootKind = 'video-project';
      rootId = project.id;
      write = () => saveVideoProject(project, { expectedWorkspaceRevision: null });
    }
    table('sync_capture').set('profile', legacy);
    const immutable = structuredClone(captures());
    await write();
    const pending = await pendingSelection(rootKind, rootId);
    expect(pending.dueAt).toBe(pending.createdAt + 300000);
    expect(captures()).toEqual(immutable);
    expect(table('sync_capture').get('profile')).toEqual(legacy);
  }
);

it('coalesces ten imported Image background saves into one complete due checkpoint', async () => {
  const f = await imageReceiptWriter('project-asset');
  const beforeRefs = structuredClone(table('asset_refs'));
  const beforeChildren = structuredClone(table('project_assets'));
  let firstDue: number | undefined;
  let selected: Awaited<ReturnType<typeof pendingSelection>> | undefined;
  for (let index = 1; index <= 10; index++) {
    await f.save(index, index * 10);
    selected = await pendingSelection('media', f.media.id);
    firstDue ??= selected.dueAt;
    expect(selected.dueAt).toBe(firstDue);
    expect(captures().filter((row) => row.rootId === f.media.id)).toHaveLength(0);
  }
  if (!selected) throw new Error('Expected pending Image');
  const checkpoint = await forceCheckpoint(selected);
  if (checkpoint?.phase !== 'native' || checkpoint.change.kind !== 'image')
    throw new Error('Expected Image checkpoint');
  expect(checkpoint.change.rows.workspace?.document.frame.paddingLeft).toBe(100);
  expect(checkpoint.change.rows.workspace?.revision).toBe(11);
  expect(checkpoint.change.rows.projectAsset).toEqual(
    table('project_assets').get('imported-image-native-receipt')
  );
  expect(table('asset_refs')).toEqual(beforeRefs);
  expect(table('project_assets')).toEqual(beforeChildren);
});

it(
  'keeps imported Image native rows and pending intent unchanged after transaction ' +
    'failure and admits one retry',
  async () => {
    const f = await imageReceiptWriter('project-asset');
    const before = structuredClone(fixture.rows);
    failCaptureWrite = true;
    await expect(f.save(1, 10)).rejects.toThrow();
    expect(fixture.rows).toEqual(before);
    failCaptureWrite = false;
    const saved = await f.save(1, 10);
    const pending = await pendingSelection('media', f.media.id);
    expect(saved.checkpointReceipt?.revision).toBe(pending.revision);
    expect(table('asset_refs').size).toBe(1);
  }
);

it(
  'refuses a stale imported Image writer after an accepted competing save without ' +
    'changing its pending revision',
  async () => {
    const f = await imageReceiptWriter('project-asset');
    await f.save(1, 10);
    const before = structuredClone(fixture.rows);
    await expect(f.save(1, 20)).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
    expect(fixture.rows).toEqual(before);
  }
);
