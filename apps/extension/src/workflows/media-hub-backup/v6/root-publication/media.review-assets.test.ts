import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ checkpoint: vi.fn(), runMutation: vi.fn() }));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  appendCommittedArchiveRootInTransaction: mocks.checkpoint,
  buildPhysicalDeleteOperation: () => ({
    assetIds: [],
    createdAt: 1,
    operationId: 'delete-1',
    status: 'pending',
    type: 'physical-delete',
  }),
  completePhysicalDeleteOperation: vi.fn(async () => undefined),
  readAssetFile: vi.fn(),
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

import { mediaLibraryRootPublisher } from './media';
import {
  journal,
  portableJson,
  portableMetadata,
  reviewFixture,
  session,
  stagedObjects,
} from './media.review-assets.test-support';

function installDatabase(metadata: ReturnType<typeof portableMetadata>) {
  const review = reviewFixture();
  const tables = new Map<string, Map<string, unknown>>([
    ['media_library', new Map([[metadata.entry.id, metadata.entry]])],
    ['project_exports', new Map([['e', { ...metadata.projectExport, assetId: 'old-local' }]])],
    [
      'video_workspaces',
      new Map([[metadata.entry.id, { ...review.workspace, sourceAssetId: 'old-local' }]]),
    ],
    ['video_workspace_drafts', new Map([[metadata.entry.id, review.draft]])],
  ]);
  const storeFor = (name: string) => {
    const table = tables.get(name) ?? new Map<string, unknown>();
    tables.set(name, table);
    return {
      get: async (key: IDBValidKey) => table.get(String(key)),
      getAll: async () => [...table.values()],
      delete: async (key: IDBValidKey) => table.delete(String(key)),
      put: async (value: Record<string, unknown>) => {
        const key = value['aggregateId'] ?? value['id'] ?? value['assetId'] ?? 'other';
        table.set(String(key), structuredClone(value));
      },
      index: () => ({ count: async () => 0 }),
    };
  };
  mocks.runMutation.mockImplementation(async (callback) =>
    callback({
      get: async (name: string, key: IDBValidKey) => storeFor(name).get(key),
      transaction: () => ({ objectStore: storeFor, done: Promise.resolve() }),
    })
  );
  return tables;
}

beforeEach(() => vi.clearAllMocks());

it.each(
  (['skip', 'replace', 'duplicate'] as const).flatMap((strategy) =>
    [true, false].map((explicitMime) => ({ strategy, explicitMime }))
  )
)(
  'round-trips standalone review assets with $strategy and explicit MIME=$explicitMime',
  async ({ strategy, explicitMime }) => {
    const metadata = portableMetadata(explicitMime);
    const tables = installDatabase(metadata);
    const result = await mediaLibraryRootPublisher.publish({
      envelope: {
        descriptor: {
          mediaSubtype: 'library-item',
          metadataPath: '_sniptale/metadata/media/export-e.json',
          objectCount: 4,
          rootId: metadata.entry.id,
          rootKind: 'media',
          totalBytes: 36,
        },
        metadata: portableJson(metadata),
        objects: [],
      },
      journal,
      session: session(strategy),
      staged: stagedObjects(),
    });
    expect(result.imported).toBe(strategy !== 'skip');
    if (strategy === 'skip') return;

    const restoredId = [...tables.get('video_workspaces')!.entries()].find(
      ([id, value]) =>
        (strategy === 'replace' ? id === metadata.entry.id : id !== metadata.entry.id) &&
        typeof value === 'object' &&
        value !== null &&
        'advanced' in value
    )![0];
    const workspace = tables.get('video_workspaces')!.get(restoredId) as ReturnType<
      typeof reviewFixture
    >['workspace'];
    const refs = [
      workspace.advanced.background.type === 'image' ? workspace.advanced.background.assetId : null,
      workspace.advanced.audio.music[0]?.assetId,
      workspace.history[0]?.target === 'advancedContent'
        ? workspace.history[0].after.audio.voiceover[0]?.assetId
        : null,
    ];
    expect(refs.every((ref) => ref?.startsWith('project-asset:'))).toBe(true);
    expect(refs).not.toEqual(
      expect.arrayContaining([
        'project-asset:background',
        'project-asset:music',
        'project-asset:voice',
      ])
    );
    for (const ref of refs) {
      const id = ref!.slice('project-asset:'.length);
      expect(tables.get('project_assets')?.get(id)).toMatchObject({ id });
      expect(tables.get('media_library')?.get(ref!)).toMatchObject({ id: ref });
    }
    expect(result.retainedAssetIds).toEqual(
      expect.arrayContaining(['new-local', 'background-bytes', 'music-bytes', 'voice-bytes'])
    );
  }
);
