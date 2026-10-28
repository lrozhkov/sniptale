import { createScenarioReplicaFixture } from '../../../composition/persistence/sync-capture/test-support/scenario-replica.test-support';
import { beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectEntryWithMediaClip } from '../../../composition/persistence/projects/index.test-support';
import { createVideoProjectAsset } from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import type { AssetRef } from '../../../composition/persistence/assets';
import { parseVideoProjectEntry } from '../../../composition/persistence/projects/read-guards';
import { captureRootKey } from '../../../composition/persistence/sync-capture/contracts';
import { parseSyncCaptureRecord } from '../../../composition/persistence/sync-capture/guards';
import { applyPreparedScenarioReplica } from '../../../composition/persistence/sync-capture/apply-scenario';
import {
  applyPreparedVideoProjectRevision,
  type ApplyPreparedVideoProjectRevisionInput,
} from '../../../composition/persistence/sync-capture/apply-video-project';
import { loadVideoEditorAssetBlob } from './asset-urls';

const io = vi.hoisted(() => ({ database: vi.fn(), mutate: vi.fn(), read: vi.fn() }));
vi.mock('../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: io.database,
}));
vi.mock('../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: (effect: unknown) => io.mutate(effect),
}));
vi.mock('../../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../../composition/persistence/assets')>()),
  readAssetFile: io.read,
  listReadyJournals: vi.fn(async () => []),
  recoverStandaloneAssetPublications: vi.fn(async () => 0),
  completePhysicalDeleteOperation: vi.fn(async () => undefined),
}));
beforeEach(() => vi.clearAllMocks());

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

async function publishScenarioMontage() {
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
  const rootKey = captureRootKey(f.input.spaceId, 'scenario-project', child.projectId);
  const state = parseSyncCaptureRecord(
    f.fixture.rows.get('sync_capture')!.get(JSON.stringify(['root-state', rootKey]))
  );
  if (!state || state.kind !== 'root-state' || !state.nativeDigest)
    throw new Error('Missing published Scenario ordering');
  const projectInput: ApplyPreparedVideoProjectRevisionInput = {
    spaceId: f.input.spaceId,
    profileCreatedAt: f.input.profileCreatedAt,
    connectionGeneration: f.input.connectionGeneration,
    operationId: 'incoming-montage',
    sourceDigest: 'c'.repeat(64),
    expectedBasis: [],
    expectedLocalGeneration: 0,
    expectedWorkspaceRevision: null,
    dependencies: [],
    root: { entry: montage, assets: [] },
    rootDependencies: [
      {
        rootKind: 'scenario-project',
        rootId: child.projectId,
        expectedGeneration: state.generation,
        expectedBasis: state.basis,
        expectedWorkspaceRevision: current.workspaceRevision,
        nativeDigest: state.nativeDigest,
        children: [{ entry: child, ref }],
      },
    ],
  };
  expect(await applyPreparedVideoProjectRevision(projectInput)).toEqual({
    status: 'applied',
    generation: 1,
  });
  const saved = parseVideoProjectEntry(f.fixture.rows.get('video_projects')!.get(montage.id));
  if (!saved) throw new Error('Missing published Montage');
  const next = structuredClone(f.input);
  next.operationId = 'scenario-rename';
  next.sourceDigest = 'b'.repeat(64);
  next.expectedLocalGeneration = 1;
  next.expectedBasis = [f.input.operationId];
  next.expectedWorkspaceRevision = current.workspaceRevision;
  next.root.entry.project.name = 'Renamed Scenario';
  return { ...f, child, ref, montage: saved, projectInput, next };
}

it('opens an incoming Scenario-derived Montage through the editor asset consumer', async () => {
  const f = await publishScenarioMontage();
  expect(f.montage.project.source).toEqual({
    kind: 'scenario',
    scenarioProjectId: f.child.projectId,
  });
  expect(f.montage.project.assets[0]!.source).toEqual({
    kind: 'scenario-asset',
    scenarioAssetId: f.child.id,
  });
  const blob = await loadVideoEditorAssetBlob(f.montage.project.assets[0]!);
  expect(blob?.type).toBe(f.child.mimeType);
  expect(blob?.size).toBe(f.child.size);
  expect(await applyPreparedVideoProjectRevision(f.projectInput)).toEqual({
    status: 'duplicate',
    generation: 1,
  });
});

it('keeps the Montage reader source after an incoming Scenario rename', async () => {
  const f = await publishScenarioMontage();
  const montage = structuredClone(f.fixture.rows.get('video_projects')!.get(f.montage.id));
  const children = structuredClone(f.fixture.rows.get('scenario_assets'));
  const owners = structuredClone(f.fixture.rows.get('asset_owners'));
  expect(await applyPreparedScenarioReplica(f.next)).toMatchObject({
    status: 'applied',
    generation: 2,
  });
  expect((await f.current())?.project.name).toBe('Renamed Scenario');
  expect(f.fixture.rows.get('video_projects')!.get(f.montage.id)).toEqual(montage);
  expect(f.fixture.rows.get('scenario_assets')).toEqual(children);
  expect(f.fixture.rows.get('asset_owners')).toEqual(owners);
  const blob = await loadVideoEditorAssetBlob(f.montage.project.assets[0]!);
  expect(blob?.type).toBe(f.child.mimeType);
  expect(blob?.size).toBe(f.child.size);
});

it.each(['changed', 'deleted', 'owner'] as const)(
  'keeps the Montage reader source after a refused Scenario child %s',
  async (change) => {
    const f = await publishScenarioMontage();
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
    expect(await loadVideoEditorAssetBlob(f.montage.project.assets[0]!)).not.toBeNull();
  }
);
