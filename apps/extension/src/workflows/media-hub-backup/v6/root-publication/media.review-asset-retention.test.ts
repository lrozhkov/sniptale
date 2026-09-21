import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkpoint: vi.fn(),
  completeDelete: vi.fn(async () => undefined),
  runMutation: vi.fn(),
}));
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
  completePhysicalDeleteOperation: mocks.completeDelete,
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

const oldReviewAssets = ['background', 'music', 'voice'].map((id) => ({
  assetId: `old-${id}-bytes`,
  createdAt: 1,
  id: `old-${id}`,
  mimeType: id === 'background' ? 'image/png' : 'audio/mpeg',
  size: 10,
}));

function oldWorkspace() {
  const workspace = structuredClone(reviewFixture().workspace);
  if (workspace.advanced.background.type === 'image') {
    workspace.advanced.background.assetId = 'project-asset:old-background';
  }
  workspace.advanced.audio.music[0]!.assetId = 'project-asset:old-music';
  const operation = workspace.history[0];
  if (operation?.target === 'advancedContent') {
    if (operation.before.background.enabled && operation.before.background.type === 'image') {
      operation.before.background.assetId = 'project-asset:old-background';
    }
    operation.before.audio.music[0]!.assetId = 'project-asset:old-music';
    if (operation.after.background.enabled && operation.after.background.type === 'image') {
      operation.after.background.assetId = 'project-asset:old-background';
    }
    operation.after.audio.music[0]!.assetId = 'project-asset:old-music';
    operation.after.audio.voiceover[0]!.assetId = 'project-asset:old-voice';
  }
  return workspace;
}

function createTables(metadata: ReturnType<typeof portableMetadata>) {
  const review = reviewFixture();
  return new Map<string, Map<string, unknown>>([
    [
      'media_library',
      new Map<string, unknown>([
        [metadata.entry.id, metadata.entry],
        ...oldReviewAssets.map(
          (entry) =>
            [
              `project-asset:${entry.id}`,
              {
                ...entry,
                id: `project-asset:${entry.id}`,
                kind: 'video',
                filename: `${entry.id}.bin`,
                originalFilename: `${entry.id}.bin`,
                source: { kind: 'project-asset', projectAssetId: entry.id },
                sourceFavicon: null,
                sourceTitle: null,
                sourceUrl: null,
                tags: [],
                updatedAt: 1,
              },
            ] as const
        ),
      ]),
    ],
    ['project_exports', new Map([['e', { ...metadata.projectExport, assetId: 'old-local' }]])],
    ['project_assets', new Map(oldReviewAssets.map((entry) => [entry.id, entry]))],
    [
      'asset_refs',
      new Map(
        oldReviewAssets.map((entry) => [
          entry.assetId,
          {
            assetId: entry.assetId,
            createdAt: 1,
            location: { kind: 'opfs', objectKey: `objects/${entry.assetId}` },
            mimeType: entry.mimeType,
            sha256: null,
            size: entry.size,
          },
        ])
      ),
    ],
    [
      'asset_owners',
      new Map(
        oldReviewAssets.map((entry) => [
          String(['project-asset', entry.id, 'body']),
          {
            assetId: entry.assetId,
            ownerId: entry.id,
            ownerKind: 'project-asset',
            role: 'body',
          },
        ])
      ),
    ],
    [
      'video_workspaces',
      new Map<string, unknown>([
        [metadata.entry.id, { ...oldWorkspace(), sourceAssetId: 'old-local' }],
        ...oldReviewAssets.map(
          (entry) =>
            [
              `project-asset:${entry.id}`,
              { aggregateId: `project-asset:${entry.id}`, stale: true },
            ] as const
        ),
      ]),
    ],
    [
      'video_workspace_drafts',
      new Map<string, unknown>([
        [metadata.entry.id, review.draft],
        ...oldReviewAssets.map(
          (entry) =>
            [
              `project-asset:${entry.id}`,
              { aggregateId: `project-asset:${entry.id}`, stale: true },
            ] as const
        ),
      ]),
    ],
  ]);
}

function installDatabase(metadata: ReturnType<typeof portableMetadata>) {
  const tables = createTables(metadata);
  const storeFor = (name: string) => {
    const table = tables.get(name) ?? new Map<string, unknown>();
    tables.set(name, table);
    return {
      get: async (key: IDBValidKey) => table.get(String(key)),
      getAll: async () => [...table.values()],
      delete: async (key: IDBValidKey) => table.delete(String(key)),
      put: async (value: Record<string, unknown>) => {
        const key = value['ownerKind']
          ? String([value['ownerKind'], value['ownerId'], value['role']])
          : (value['aggregateId'] ?? value['id'] ?? value['assetId'] ?? 'other');
        table.set(String(key), structuredClone(value));
      },
      index: () => ({
        count: async (assetId: string) =>
          [...table.values()].filter(
            (value) =>
              typeof value === 'object' &&
              value !== null &&
              (value as Record<string, unknown>)['assetId'] === assetId
          ).length,
      }),
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

it('removes the obsolete exclusive review graph and journals its bytes on replace', async () => {
  const metadata = portableMetadata(true);
  const tables = installDatabase(metadata);
  await mediaLibraryRootPublisher.publish({
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
    session: session('replace'),
    staged: stagedObjects(),
  });

  for (const entry of oldReviewAssets) {
    const aggregateId = `project-asset:${entry.id}`;
    expect(tables.get('project_assets')?.has(entry.id)).toBe(false);
    expect(tables.get('media_library')?.has(aggregateId)).toBe(false);
    expect(tables.get('video_workspaces')?.has(aggregateId)).toBe(false);
    expect(tables.get('video_workspace_drafts')?.has(aggregateId)).toBe(false);
    expect(
      [...(tables.get('asset_owners')?.values() ?? [])].some(
        (value) =>
          typeof value === 'object' &&
          value !== null &&
          (value as Record<string, unknown>)['ownerId'] === entry.id
      )
    ).toBe(false);
    expect(tables.get('asset_refs')?.has(entry.assetId)).toBe(false);
  }
  expect(mocks.completeDelete).toHaveBeenCalledWith(
    expect.objectContaining({
      assetIds: expect.arrayContaining(oldReviewAssets.map((entry) => entry.assetId)),
    })
  );
});
