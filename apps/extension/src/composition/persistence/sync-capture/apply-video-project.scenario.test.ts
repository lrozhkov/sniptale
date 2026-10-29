import { beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/factories';
import { createScenarioProjectEntry } from '../scenario/projects/entry';
import { createVideoProjectAsset } from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import {
  freezeScenarioInTransaction,
  digestCapturedScenarioRows,
  SCENARIO_CAPTURE_STORES,
} from './scenario-snapshot';
import type { AssetRef } from '../assets';
import { captureRootKey, type SyncCaptureRootState } from './contracts';
import { applyPreparedVideoProjectRevision } from './apply-video-project';
import {
  createVideoProjectReplicaFixture,
  spaceId,
  projectId,
} from './apply-video-project.test-support';

const io = vi.hoisted(() => ({ database: vi.fn(), cleanup: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  completePhysicalDeleteOperation: io.cleanup,
  recoverStandaloneAssetPublications: vi.fn(async () => 0),
  readAssetFile: vi.fn(
    async (ref: AssetRef) =>
      new File([new Uint8Array(ref.size)], 'scenario.png', { type: ref.mimeType })
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  io.cleanup.mockResolvedValue(undefined);
});

async function scenarioSetup() {
  const fixture = createVideoProjectReplicaFixture((db) => io.database.mockResolvedValue(db));
  for (const name of [
    'scenario_projects',
    'scenario_project_history',
    'scenario_project_units',
    'scenario_exports',
    'scenario_step_editor_documents',
  ])
    fixture.rows.set(name, new Map());
  const scenario = createScenarioProjectEntry({
    project: createGuideProject('Source guide', 'scenario-source', 1),
    existing: undefined,
    updatedAt: 1,
  });
  const child = {
    assetId: 'scenario-bytes',
    id: 'scenario-child',
    projectId: scenario.id,
    mimeType: 'image/png',
    size: 3,
    width: 10,
    height: 10,
    galleryAssetId: null,
    createdAt: 1,
  };
  const ref: AssetRef = {
    assetId: child.assetId,
    size: child.size,
    mimeType: child.mimeType,
    createdAt: 1,
    sha256: 'd'.repeat(64),
    location: { kind: 'opfs', objectKey: 'objects/scenario-bytes' },
  };
  fixture.table('scenario_projects').set(scenario.id, scenario);
  fixture.table('scenario_assets').set(child.id, child);
  fixture.table('asset_refs').set(ref.assetId, ref);
  fixture.table('asset_owners').set(JSON.stringify(['scenario-asset', child.id, 'body']), {
    ownerKind: 'scenario-asset',
    ownerId: child.id,
    role: 'body',
    assetId: child.assetId,
  });
  const tx = fixture.database.transaction([...SCENARIO_CAPTURE_STORES], 'readonly');
  const frozen = await freezeScenarioInTransaction(
    tx as unknown as Parameters<typeof freezeScenarioInTransaction>[0],
    scenario.id
  );
  await tx.done;
  const rootKey = captureRootKey(spaceId, 'scenario-project', scenario.id);
  const state: SyncCaptureRootState = {
    version: 1,
    kind: 'root-state',
    key: JSON.stringify(['root-state', rootKey]),
    spaceId,
    createdAt: 1,
    rootKind: 'scenario-project',
    rootId: scenario.id,
    rootKey,
    generation: 4,
    basis: ['scenario-head'],
    nativeRevision: scenario.workspaceRevision,
    nativeDigest: digestCapturedScenarioRows(frozen),
  };
  fixture.table('sync_capture').set(state.key, state);
  fixture.input.dependencies = [];
  fixture.input.root.entry.project.source = { kind: 'scenario', scenarioProjectId: scenario.id };
  const asset = createVideoProjectAsset(
    'Guide image',
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
  fixture.input.root.entry.project.assets = [asset];
  fixture.input.root.entry.project.clips = [
    createVideoClipFromAsset(fixture.input.root.entry.project.tracks[0]!.id, asset, 1920, 1080),
  ];
  fixture.input.rootDependencies = [
    {
      rootKind: 'scenario-project',
      rootId: scenario.id,
      expectedGeneration: state.generation,
      expectedBasis: state.basis,
      expectedWorkspaceRevision: scenario.workspaceRevision,
      nativeDigest: state.nativeDigest!,
      children: [{ entry: child, ref }],
    },
  ];
  io.database.mockResolvedValue({
    ...fixture.database,
    get: async (name: string, id: string) => fixture.table(name).get(id),
  });
  return { ...fixture, child, scenario, state };
}

it('publishes Scenario-derived Montage without replacing its borrowed root', async () => {
  const fixture = await scenarioSetup();
  const beforeScenario = structuredClone(fixture.table('scenario_projects'));
  const beforeChildren = structuredClone(fixture.table('scenario_assets'));
  const beforeOwners = structuredClone(fixture.table('asset_owners'));
  expect(await applyPreparedVideoProjectRevision(fixture.input)).toEqual({
    status: 'applied',
    generation: 1,
  });
  const raw = fixture.table('video_projects').get(projectId);
  const { parseVideoProjectEntry } = await import('../projects/read-guards');
  const saved = parseVideoProjectEntry(raw);
  expect(saved?.project.source).toEqual(fixture.input.root.entry.project.source);
  expect(saved?.project.assets[0]!.source).toEqual({
    kind: 'scenario-asset',
    scenarioAssetId: fixture.child.id,
  });
  expect(fixture.table('scenario_projects')).toEqual(beforeScenario);
  expect(fixture.table('scenario_assets')).toEqual(beforeChildren);
  expect(fixture.table('asset_owners')).toEqual(beforeOwners);
  expect(fixture.table('project_assets').size).toBe(0);
  expect(await applyPreparedVideoProjectRevision(fixture.input)).toEqual({
    status: 'duplicate',
    generation: 1,
  });
});

it.each(['child-bytes', 'owner', 'parallel-head', 'delete-recreate'] as const)(
  'refuses delayed Scenario-dependent publication after %s changes',
  async (change) => {
    const fixture = await scenarioSetup();
    if (change === 'child-bytes')
      fixture
        .table('scenario_assets')
        .set(fixture.child.id, { ...fixture.child, assetId: 'replacement-bytes' });
    else if (change === 'owner')
      fixture
        .table('asset_owners')
        .delete(JSON.stringify(['scenario-asset', fixture.child.id, 'body']));
    else
      fixture.table('sync_capture').set(fixture.state.key, {
        ...fixture.state,
        generation: fixture.state.generation + (change === 'delete-recreate' ? 2 : 1),
        basis: [change],
      });
    await expect(applyPreparedVideoProjectRevision(fixture.input)).rejects.toThrow();
    expect(fixture.table('video_projects').has(projectId)).toBe(false);
  }
);

it('rolls back failed Scenario-dependent publication and permits an exact command retry', async () => {
  const fixture = await scenarioSetup();
  fixture.failReceipt();
  await expect(applyPreparedVideoProjectRevision(fixture.input)).rejects.toThrow();
  expect(fixture.table('video_projects').has(projectId)).toBe(false);
  fixture.allowWrites();
  expect(await applyPreparedVideoProjectRevision(fixture.input)).toEqual({
    status: 'applied',
    generation: 1,
  });
});
