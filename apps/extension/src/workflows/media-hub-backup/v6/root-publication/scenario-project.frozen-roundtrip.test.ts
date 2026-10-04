import { encodePortableScenarioProjectEntry } from '../root-codecs/projects';
import { expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../../features/scenario/project/public';
import {
  createGuideStep,
  createGuideImageBlock,
} from '../../../../features/scenario/project/factories';
import { createMediaLibraryEntry } from '../../../../composition/persistence/projects/index.test-support';
import { scenarioChildUsesMedia } from '../../../../composition/persistence/media-library/dependencies';
import { parseScenarioAssetEntry } from '../../../../composition/persistence/scenario/read-guards';
import { parseMediaLibraryEntry } from '../../../../composition/persistence/media-library/read-guards';
import { portableJson, session as mediaSession } from './media.review-assets.test-support';

const io = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: io.db,
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (effect: (db: unknown) => Promise<unknown>) =>
    effect(await io.db()),
}));
import { scenarioProjectRootPublisher } from './scenario-project';

function installDatabase(rows: Map<string, Map<string, unknown>>) {
  let working = rows;
  const writes: Array<{ name: string; value: unknown }> = [];
  const table = (name: string) => {
    if (!working.has(name)) working.set(name, new Map());
    return working.get(name)!;
  };
  const store = (name: string) => ({
    get: async (key: IDBValidKey) => table(name).get(String(key)),
    getAll: async () => [...table(name).values()],
    delete: async (key: IDBValidKey) => table(name).delete(String(key)),
    put: async (value: Record<string, unknown>) => {
      const key = value['ownerKind']
        ? String([value['ownerKind'], value['ownerId'], value['role']])
        : String(value['operationId'] ?? value['id'] ?? value['assetId'] ?? value['aggregateId']);
      table(name).set(key, structuredClone(value));
      writes.push({ name, value: structuredClone(value) });
    },
    index: (key: string) => ({
      getAll: async (id: string) =>
        [...table(name).values()].filter(
          (row) =>
            typeof row === 'object' && row !== null && (row as Record<string, unknown>)[key] === id
        ),
      count: async (id: string) =>
        [...table(name).values()].filter(
          (row) =>
            typeof row === 'object' && row !== null && (row as Record<string, unknown>)[key] === id
        ).length,
    }),
  });
  io.db.mockResolvedValue({
    get: async (name: string, key: IDBValidKey) => store(name).get(key),
    transaction: () => {
      working = structuredClone(rows);
      let aborted = false;
      return {
        objectStore: store,
        get done() {
          if (!aborted) {
            rows.clear();
            for (const [name, values] of working) rows.set(name, values);
          }
          working = rows;
          return Promise.resolve();
        },
        abort: () => {
          aborted = true;
          working = rows;
        },
      };
    },
  });
  return writes;
}

function input(strategy: 'replace' | 'skip', staleCheckpoint = false) {
  const project = createGuideProject('Scenario', 'scenario', 1);
  const step = createGuideStep('Used');
  step.blocks = [
    createGuideImageBlock({
      id: 'block',
      assetId: 'captured',
      width: 100,
      height: 50,
      source: { kind: 'import', filename: 'image.png' },
    }),
  ];
  project.items = [step];
  const media = createMediaLibraryEntry({
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 },
    id: 'scenario-asset:captured',
    source: { kind: 'stored-asset', assetId: 'published-new' },
  });
  const session = {
    ...mediaSession(strategy),
    currentRoot: 'scenario-project:scenario',
    committedRoots: ['media:library-item:scenario-asset:captured'],
    rootIdMap: { 'media:library-item:scenario-asset:captured': media.id },
  };
  const rows = new Map<string, Map<string, unknown>>([
    ['media_library', new Map([[media.id, media]])],
    [
      'asset_operations',
      new Map([
        [
          session.operationId,
          { ...session, ...(staleCheckpoint ? { currentRoot: 'different-root' } : {}) },
        ],
      ]),
    ],
    [
      'asset_owners',
      new Map([
        [
          String(['media-library', media.id, 'source']),
          {
            assetId: 'published-new',
            ownerKind: 'media-library',
            ownerId: media.id,
            role: 'source',
          },
        ],
      ]),
    ],
  ]);
  const writes = installDatabase(rows);
  const ref = {
    assetId: 'frozen-old',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/frozen-old' },
    mimeType: 'image/png',
    size: 4,
    sha256: null,
  };
  const args: Parameters<typeof scenarioProjectRootPublisher.publish>[0] = {
    envelope: {
      descriptor: {
        rootKind: 'scenario-project',
        rootId: project.id,
        metadataPath: '_sniptale/metadata/scenario.json',
        objectCount: 1,
        totalBytes: 4,
      },
      objects: [],
      metadata: portableJson({
        entry: encodePortableScenarioProjectEntry({
          id: project.id,
          project,
          createdAt: 1,
          updatedAt: 1,
          workspaceRevision: 1,
        }),
        assets: [
          {
            entry: {
              id: 'captured',
              projectId: project.id,
              galleryAssetId: media.id,
              mimeType: 'image/png',
              size: 4,
              width: 100,
              height: 50,
              createdAt: 1,
            },
            objectId: 'image',
          },
        ],
        exports: [],
        exportThumbnails: [],
        stepDocuments: [],
      }),
    },
    journal: {
      journalId: 'ready',
      domain: 'archive-restore',
      createdAt: 1,
      assetRefs: [ref],
      payload: {},
    },
    session,
    staged: [{ objectId: 'image', ref }],
  };
  return { args, media, ref, rows, writes };
}

it.each(['replace', 'skip'] as const)(
  'commits the frozen canonical scenario roundtrip using real domain admission: %s',
  async (strategy) => {
    const { args, media, ref, rows } = input(strategy);
    await expect(scenarioProjectRootPublisher.publish(args)).resolves.toMatchObject({
      imported: true,
      retainedAssetIds: [ref.assetId],
    });
    expect(rows.get('media_library')!.get(media.id)).toMatchObject({
      lifecycle: { storageClass: 'library' },
    });
    const child = parseScenarioAssetEntry(rows.get('scenario_assets')!.get('captured'));
    const root = parseMediaLibraryEntry(rows.get('media_library')!.get(media.id));
    if (!child || !root) throw new Error('Missing committed identities');
    expect(child.assetId).toBe('frozen-old');
    expect(child.borrowedMediaId).toBeUndefined();
    expect(scenarioChildUsesMedia(child, root)).toBe(true);
    expect(
      rows.get('asset_owners')!.get(String(['scenario-asset', child.id, 'body']))
    ).toMatchObject({ assetId: ref.assetId });
  }
);

it('aborts frozen resource and owner writes when the real archive checkpoint refuses', async () => {
  const { args, media, rows, writes } = input('replace', true);
  const beforeCheckpoint = structuredClone(rows.get('asset_operations'));
  await expect(scenarioProjectRootPublisher.publish(args)).rejects.toThrow(
    'Archive restore root checkpoint does not match'
  );
  expect(writes).toContainEqual({
    name: 'media_library',
    value: expect.objectContaining({
      id: media.id,
      lifecycle: expect.objectContaining({ storageClass: 'library' }),
    }),
  });
  expect(rows.get('asset_operations')).toEqual(beforeCheckpoint);
  expect(rows.get('scenario_projects')?.size ?? 0).toBe(0);
  expect(rows.get('scenario_assets')?.size ?? 0).toBe(0);
  expect(rows.get('asset_owners')!.size).toBe(1);
  expect(rows.get('media_library')!.get(media.id)).toEqual(media);
});
