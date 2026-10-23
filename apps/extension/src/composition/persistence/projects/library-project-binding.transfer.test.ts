import { beforeEach, expect, it, vi } from 'vitest';
import type { AssetRef } from '../assets/contracts';
import {
  createReviewWorkspaceStoreFixture,
  replaceLegacyWorkspaceFixture,
} from '../review-workspaces/store.test-support';
import {
  createProjectExportEntry,
  createVideoProjectEntryWithMediaClip,
} from './index.test-support';
import { prepareLibraryProjectBindingForCommit } from './library-project-binding';
import { commitVideoProjectMutation } from './index-mutations';
import { openVideoWorkspace, readVideoWorkspace } from '../review-workspaces/store';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

const io = vi.hoisted(() => ({ database: vi.fn(), recover: vi.fn(), publish: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('./asset-publication', async (original) => ({
  ...(await original<typeof import('./asset-publication')>()),
  recoverProjectMediaPublications: io.recover,
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  listReadyJournals: async () => [],
}));
vi.mock('../../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: io.publish,
}));

const mediaId = 'project-export:source-export';
const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
const ref: AssetRef = {
  assetId: 'source-bytes',
  createdAt: 1,
  mimeType: source.mimeType,
  size: source.size,
  sha256: null,
  location: { kind: 'opfs', objectKey: 'objects/source-bytes' },
};

beforeEach(() => {
  vi.clearAllMocks();
  io.recover.mockResolvedValue(undefined);
});

async function setup() {
  let failedStore: string | undefined;
  const fixture = createReviewWorkspaceStoreFixture((store) => store === failedStore && !!store);
  for (const store of [
    'scenario_projects',
    'scenario_project_history',
    'scenario_project_units',
    'project_export_inputs',
  ])
    fixture.rows.set(store, new Map());
  io.database.mockResolvedValue({
    ...fixture.database,
    get: async (store: string, id: string) => structuredClone(fixture.rows.get(store)?.get(id)),
  });
  const media = fixture.rows.get('media_library')!.get('recording:beta-v1-recording');
  if (!isRecord(media)) throw new Error('Missing source fixture');
  const locator = {
    kind: 'project-export' as const,
    exportId: 'source-export',
    projectId: 'origin',
  };
  fixture.rows
    .get('media_library')!
    .set(mediaId, { ...media, id: mediaId, kind: 'export', source: locator });
  fixture.rows.get('project_exports')!.set(
    'source-export',
    createProjectExportEntry({
      ...source,
      id: 'source-export',
      projectId: 'origin',
      assetId: ref.assetId,
      filename: 'source.webm',
      createdAt: 1,
      fps: 30,
    })
  );
  fixture.rows.get('asset_refs')!.set(ref.assetId, ref);
  fixture.rows
    .get('asset_owners')!
    .set(JSON.stringify(['project-export', 'source-export', 'body']), {
      assetId: ref.assetId,
      ownerId: 'source-export',
      ownerKind: 'project-export',
      role: 'body',
    });
  const opened = await openVideoWorkspace(mediaId, source);
  const destination = (id: string) => {
    const project = createVideoProjectEntryWithMediaClip({ id }).project;
    const asset = project.assets[0]!;
    if (asset.source.kind !== 'project-asset') throw new Error('Missing destination source');
    asset.source.projectAssetId = `${id}-binding`;
    const binding = prepareLibraryProjectBindingForCommit(
      {
        mediaId,
        source: locator,
        ref,
        filename: 'source.webm',
        file: new File(['source'], 'source.webm'),
      },
      asset.source.projectAssetId
    );
    return {
      project,
      options: {
        baseRevision: null,
        expectedReviewWorkspace: opened.workspace,
        libraryBindings: [binding],
      },
    };
  };
  return {
    ...fixture,
    opened,
    destination,
    fail: (store?: string) => {
      failedStore = store;
    },
  };
}

it('publishes a private binding and destination together without copying or cataloguing source bytes', async () => {
  const fixture = await setup();
  const item = fixture.destination('destination');
  const before = structuredClone(fixture.rows.get('asset_refs'));
  await commitVideoProjectMutation(item.project, item.options);
  expect(fixture.rows.get('project_assets')!.get('destination-binding')).toEqual(
    item.options.libraryBindings[0]!.entry
  );
  expect(fixture.rows.get('video_projects')!.has('destination')).toBe(true);
  expect(fixture.rows.get('media_library')!.has('project-asset:destination-binding')).toBe(false);
  expect(fixture.rows.get('asset_refs')).toEqual(before);
  expect(fixture.rows.get('asset_owners')!.size).toBe(2);
});

it('aborts private ownership after a destination write fails and retries without leaking identities', async () => {
  const fixture = await setup();
  const before = structuredClone(fixture.rows);
  const item = fixture.destination('failed');
  fixture.fail('video_projects');
  await expect(commitVideoProjectMutation(item.project, item.options)).rejects.toThrow('No space');
  expect(fixture.rows).toEqual(before);
  fixture.fail();
  const retry = fixture.destination('retry');
  await commitVideoProjectMutation(retry.project, retry.options);
  expect([...fixture.rows.get('project_assets')!.keys()]).toEqual(['retry-binding']);
});

function barrier() {
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  io.recover.mockImplementationOnce(async () => {
    entered();
    await blocked;
  });
  return { started, release };
}

it('preserves another destination while a parallel transfer fails', async () => {
  const fixture = await setup();
  const failed = fixture.destination('failed');
  const gate = barrier();
  const pending = commitVideoProjectMutation(failed.project, failed.options);
  await gate.started;
  const accepted = fixture.destination('accepted');
  await commitVideoProjectMutation(accepted.project, accepted.options);
  const before = structuredClone(fixture.rows);
  fixture.fail('video_projects');
  gate.release();
  await expect(pending).rejects.toThrow('No space');
  expect(fixture.rows).toEqual(before);
  expect([...fixture.rows.get('project_assets')!.keys()]).toEqual(['accepted-binding']);
});

it.each(['deleted', 'restored', 'recreated'] as const)(
  'refuses a delayed transfer after its source is %s and preserves current state',
  async (change) => {
    const fixture = await setup();
    const item = fixture.destination('delayed');
    const gate = barrier();
    const pending = commitVideoProjectMutation(item.project, item.options);
    await gate.started;
    if (change === 'deleted') fixture.rows.get('video_workspaces')!.delete(mediaId);
    else {
      const replacement = structuredClone(fixture.opened.workspace);
      if (change === 'recreated') replacement.createdAt += 1;
      else replacement.advanced.audio.original.volume = 0.5;
      replaceLegacyWorkspaceFixture(fixture.rows, mediaId, replacement);
    }
    const before = structuredClone(fixture.rows);
    gate.release();
    await expect(pending).rejects.toMatchObject({ name: 'VideoWorkspaceError' });
    expect(fixture.rows).toEqual(before);
    expect(fixture.rows.get('project_assets')!.size).toBe(0);
  }
);

it('refuses an old destination attempt when that identity has been created by another transfer', async () => {
  const fixture = await setup();
  const old = fixture.destination('same');
  const gate = barrier();
  const pending = commitVideoProjectMutation(old.project, old.options);
  await gate.started;
  const current = fixture.destination('same');
  await commitVideoProjectMutation(current.project, current.options);
  const before = structuredClone(fixture.rows);
  gate.release();
  await expect(pending).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
  expect(fixture.rows).toEqual(before);
});

it('refuses a recreated private binding even when it points to the same immutable bytes', async () => {
  const fixture = await setup();
  const item = fixture.destination('destination');
  const binding = item.options.libraryBindings[0]!;
  fixture.rows
    .get('project_assets')!
    .set(binding.entry.id, { ...binding.entry, createdAt: binding.entry.createdAt + 1 });
  fixture.rows
    .get('asset_owners')!
    .set(JSON.stringify(['project-asset', binding.entry.id, 'body']), {
      assetId: ref.assetId,
      ownerId: binding.entry.id,
      ownerKind: 'project-asset',
      role: 'body',
    });
  const before = structuredClone(fixture.rows);
  await expect(commitVideoProjectMutation(item.project, item.options)).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
  expect(await readVideoWorkspace(mediaId)).toEqual(fixture.opened);
});
