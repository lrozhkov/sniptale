import { workspaceStorageHead, workspaceStorageRows } from '../review-workspaces/storage-format';
import { createMediaLibraryEntry } from './index.test-support';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildDelete: vi.fn(),
  completeDelete: vi.fn(),
  recoverStandalone: vi.fn(),
  runMutation: vi.fn(),
  readReview: vi.fn(),
  discardPrepared: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  buildPhysicalDeleteOperation: mocks.buildDelete,
  completePhysicalDeleteOperation: mocks.completeDelete,
  recoverStandaloneAssetPublications: mocks.recoverStandalone,
  discardPreparedAsset: mocks.discardPrepared,
}));

vi.mock('../review-workspaces/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../review-workspaces/store')>()),
  readVideoWorkspace: mocks.readReview,
}));

import {
  PROJECT_ASSET_PUBLICATION_DOMAIN,
  PROJECT_EXPORT_PUBLICATION_DOMAIN,
  publishProjectAssetJournal,
  projectAssetPublicationAdapter,
  publishProjectExportJournal,
  recoverProjectMediaPublications,
} from './asset-publication';
import type { AssetReadyJournal } from '../assets';
import { withVoiceoverAttachmentLock } from './voiceover-publication-lock';
import { parseProjectAssetPayload } from './asset-publication-payload';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { reviewAdvancedContentBaseline } from '../../../features/video/review/document';
import { readFileSync } from 'node:fs';
import { validateEffectV1Document } from '@sniptale/runtime-contracts/effect-v1';
import type { VideoWorkspace } from '../review-workspaces/contracts';

const ref = {
  assetId: 'asset-new',
  createdAt: 2,
  location: { kind: 'opfs' as const, objectKey: 'objects/asset-new' },
  mimeType: 'video/webm',
  sha256: null,
  size: 5,
};

const exportEntry = {
  assetId: ref.assetId,
  createdAt: 2,
  duration: 4,
  filename: 'export.webm',
  fps: 30,
  height: 720,
  id: 'export-1',
  mimeType: ref.mimeType,
  projectId: 'project-1',
  size: ref.size,
  width: 1280,
};

function annotationRecoveryFixture(cursor: number) {
  const source = readFileSync(
    'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json',
    'utf8'
  );
  const validated = validateEffectV1Document(JSON.parse(source));
  if (!validated.ok || !validated.document) throw new Error('Invalid fixture');
  const descriptor = validated.document.assets[0]!;
  const snapshotId = `effect:${'a'.repeat(64)}`;
  const entry = {
    id: 'mark',
    assetId: ref.assetId,
    mimeType: descriptor.mimeType,
    size: descriptor.byteLength!,
    createdAt: 2,
  };
  const claim = {
    aggregateId: 'review',
    sourceAssetId: 'source',
    snapshotId,
    resourceId: descriptor.id,
    sha256: descriptor.sha256!,
  };
  const advanced = createQuickEditAdvancedState();
  const before = reviewAdvancedContentBaseline(advanced);
  const workspace: VideoWorkspace = {
    aggregateId: 'review',
    sourceAssetId: 'source',
    formatVersion: 1,
    source: { duration: 10, width: 640, height: 360, size: 10, mimeType: 'video/webm' },
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    advanced,
    cursor,
    effectSnapshots: [
      {
        id: snapshotId,
        schemaVersion: 'sniptale.effect.v1',
        kind: 'standalone',
        documentId: validated.document.id,
        sha256: 'a'.repeat(64),
        source,
        retainedByteLength: new TextEncoder().encode(source).byteLength + entry.size,
        assets: [
          {
            id: descriptor.id,
            assetId: 'project-asset:mark',
            kind: 'svg',
            mimeType: entry.mimeType,
            sha256: claim.sha256,
            byteLength: entry.size,
          },
        ],
      },
    ],
    history: [
      {
        id: 'apply',
        at: 1,
        target: 'advancedContent',
        before,
        after: {
          ...before,
          annotationEffects: {
            enabled: false,
            instances: [
              {
                id: 'effect',
                snapshotId,
                enabled: false,
                start: 1,
                end: 4,
                attachment: 'viewport',
                transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
                controls: {},
                order: 0,
              },
            ],
          },
        },
      },
    ],
  };
  const journal: AssetReadyJournal = {
    journalId: 'annotation-ready',
    domain: PROJECT_ASSET_PUBLICATION_DOMAIN,
    createdAt: 2,
    assetRefs: [{ ...ref, size: entry.size, mimeType: entry.mimeType }],
    payload: {
      entry,
      filename: 'mark.svg',
      expectedAssetId: null,
      publishToLibrary: false,
      requiredReviewAnnotationEffect: claim,
    },
  };
  return { workspace, entry, claim, journal };
}

it.each([0, 1])(
  'recovers private bytes retained by disabled Undo/Redo at cursor %i',
  async (cursor) => {
    const fixture = annotationRecoveryFixture(cursor);
    mocks.readReview.mockResolvedValue({ workspace: fixture.workspace });
    const writes: Array<[string, 'delete' | 'put', unknown]> = [];
    mocks.runMutation.mockImplementation(async (operation) =>
      operation({
        transaction: () =>
          createTransaction(writes, Promise.resolve(), undefined, undefined, fixture.workspace),
      })
    );
    await projectAssetPublicationAdapter.publish(fixture.journal);
    expect(writes).toContainEqual(['project_assets', 'put', fixture.entry]);
    expect(writes.some(([store]) => store === 'media_library')).toBe(false);
  }
);

it('refuses recovery for unused registry sources and mismatched exact source/resource bindings', async () => {
  const fixture = annotationRecoveryFixture(0);
  for (const workspace of [
    { ...fixture.workspace, history: [] },
    { ...fixture.workspace, sourceAssetId: 'other' },
    {
      ...fixture.workspace,
      effectSnapshots: fixture.workspace.effectSnapshots!.map((snapshot) => ({
        ...snapshot,
        assets: snapshot.assets.map((asset) => ({ ...asset, sha256: 'b'.repeat(64) })),
      })),
    },
  ]) {
    mocks.readReview.mockResolvedValue({ workspace });
    await expect(projectAssetPublicationAdapter.publish(fixture.journal)).rejects.toMatchObject({
      name: 'SupersededAssetPublicationError',
    });
  }
  expect(mocks.runMutation).not.toHaveBeenCalled();
});

it('refuses mixed or malformed annotation claims at the recovered payload boundary', () => {
  const fixture = annotationRecoveryFixture(0);
  const valid = {
    entry: fixture.entry,
    filename: 'mark.svg',
    expectedAssetId: null,
    publishToLibrary: false,
    requiredReviewAnnotationEffect: fixture.claim,
  };
  expect(parseProjectAssetPayload(valid)).toEqual(valid);
  for (const change of [
    { publishToLibrary: true },
    { expectedAssetId: 'replace' },
    { librarySourceId: 'library' },
    { entry: { ...fixture.entry, mimeType: 'audio/webm' } },
    { requiredReviewResource: { aggregateId: 'review', slot: 'watermark' } },
    { requiredReview: { aggregateId: 'review', clipId: 'voice' } },
    { requiredReviewAnnotationEffect: { ...fixture.claim, sourceAssetId: '' } },
    { requiredReviewAnnotationEffect: { ...fixture.claim, sha256: 'not-a-hash' } },
    { requiredReviewAnnotationEffect: { ...fixture.claim, secret: 'unrecognized' } },
  ])
    expect(parseProjectAssetPayload({ ...valid, ...change })).toBeNull();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buildDelete.mockReturnValue({
    assetIds: [],
    createdAt: 2,
    kind: 'physical-delete',
    operationId: 'delete-1',
    status: 'pending',
    updatedAt: 2,
  });
  mocks.completeDelete.mockResolvedValue(undefined);
});

it('atomically publishes a direct project export ref, owner, row, and mirror', async () => {
  const writes: Array<[string, 'delete' | 'put', unknown]> = [];
  const transaction = createTransaction(writes, Promise.resolve());
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: vi.fn(() => transaction) })
  );

  await publishProjectExportJournal(
    createJournal(PROJECT_EXPORT_PUBLICATION_DOMAIN, {
      entry: exportEntry,
    })
  );

  expect(writes).toContainEqual(['asset_refs', 'put', ref]);
  expect(writes).toContainEqual([
    'asset_owners',
    'put',
    {
      assetId: 'asset-new',
      ownerId: 'export-1',
      ownerKind: 'project-export',
      role: 'body',
    },
  ]);
  expect(writes).toContainEqual(['project_exports', 'put', exportEntry]);
  expect(writes).toContainEqual([
    'media_library',
    'put',
    expect.objectContaining({
      id: 'export:export-1',
      source: { exportId: 'export-1', kind: 'project-export', projectId: 'project-1' },
    }),
  ]);
  expect(writes).not.toContainEqual(['recordings', 'put', expect.anything()]);
});

it('does not physically delete a replaced object before the IDB transaction commits', async () => {
  const writes: Array<[string, 'delete' | 'put', unknown]> = [];
  const failure = new Error('commit failed');
  const transaction = createTransaction(writes, Promise.reject(failure), {
    ...exportEntry,
    assetId: 'asset-old',
  });
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: vi.fn(() => transaction) })
  );

  await expect(
    publishProjectExportJournal(
      createJournal(PROJECT_EXPORT_PUBLICATION_DOMAIN, {
        entry: exportEntry,
        expectedAssetId: 'asset-old',
      })
    )
  ).rejects.toBe(failure);
  expect(mocks.completeDelete).not.toHaveBeenCalled();
});

it('publishes project assets with the archive filename and rejects workflow journals', async () => {
  const writes: Array<[string, 'delete' | 'put', unknown]> = [];
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: vi.fn(() => createTransaction(writes, Promise.resolve())) })
  );
  const entry = {
    assetId: ref.assetId,
    createdAt: 2,
    id: 'project-asset-1',
    mimeType: ref.mimeType,
    size: ref.size,
  };

  await publishProjectAssetJournal(
    createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, { entry, filename: 'clip.webm' })
  );
  expect(writes).toContainEqual([
    'media_library',
    'put',
    expect.objectContaining({
      filename: 'clip.webm',
      id: 'project-asset:project-asset-1',
      lifecycle: { storageClass: 'library', savedAt: 2, updatedAt: 2 },
    }),
  ]);

  await expect(
    publishProjectAssetJournal({
      ...createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, { entry, filename: 'clip.webm' }),
      operationId: 'restore-1',
    })
  ).rejects.toThrow('Invalid standalone project asset publication journal');
});

it('registers only the two project media publication domains for standalone recovery', async () => {
  mocks.recoverStandalone.mockResolvedValue(2);

  await expect(recoverProjectMediaPublications()).resolves.toBe(2);
  expect(mocks.recoverStandalone).toHaveBeenCalledWith([
    expect.objectContaining({ domain: PROJECT_ASSET_PUBLICATION_DOMAIN }),
    expect.objectContaining({ domain: PROJECT_EXPORT_PUBLICATION_DOMAIN }),
  ]);
});

it('discards an old staged voiceover journal without a durable review reference', async () => {
  mocks.readReview.mockResolvedValue(null);
  await expect(
    projectAssetPublicationAdapter.publish(
      createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
        entry: {
          assetId: ref.assetId,
          createdAt: 2,
          id: 'voice-1',
          mimeType: ref.mimeType,
          size: ref.size,
        },
        filename: 'voice.webm',
        requiredReview: { aggregateId: 'review-1', clipId: 'clip-1' },
      })
    )
  ).rejects.toMatchObject({ name: 'SupersededAssetPublicationError' });
  expect(mocks.readReview).toHaveBeenCalledWith('review-1');
  expect(mocks.discardPrepared).not.toHaveBeenCalled();
  expect(mocks.runMutation).not.toHaveBeenCalled();
});

it('defers cleanup of an aged voiceover journal during an active attachment', async () => {
  mocks.readReview.mockResolvedValue(null);
  const journal = createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
    entry: {
      assetId: ref.assetId,
      createdAt: 2,
      id: 'voice-1',
      mimeType: ref.mimeType,
      size: ref.size,
    },
    filename: 'voice.webm',
    requiredReview: { aggregateId: 'review-1', clipId: 'clip-1' },
  });
  let finishAttachment!: () => void;
  const attachment = withVoiceoverAttachmentLock(
    'project-asset:voice-1',
    () =>
      new Promise<void>((resolve) => {
        finishAttachment = resolve;
      })
  );
  await expect(projectAssetPublicationAdapter.publish(journal)).resolves.toBe('defer');
  expect(mocks.discardPrepared).not.toHaveBeenCalled();
  expect(mocks.runMutation).not.toHaveBeenCalled();
  finishAttachment();
  await attachment;
  await expect(projectAssetPublicationAdapter.publish(journal)).rejects.toMatchObject({
    name: 'SupersededAssetPublicationError',
  });
  expect(mocks.discardPrepared).not.toHaveBeenCalled();
});

it('recovers a voiceover asset when its durable review history retains the clip', async () => {
  const writes: Array<[string, 'delete' | 'put', unknown]> = [];
  mocks.readReview.mockResolvedValue({
    workspace: {
      advanced: { audio: { voiceover: [], music: [] } },
      history: [
        {
          target: 'advancedContent',
          before: { audio: { voiceover: [], music: [] } },
          after: {
            audio: { voiceover: [{ id: 'clip-1', assetId: 'project-asset:voice-1' }], music: [] },
          },
        },
      ],
    },
  });
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: () => createTransaction(writes, Promise.resolve()) })
  );
  await projectAssetPublicationAdapter.publish(
    createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
      entry: {
        assetId: ref.assetId,
        createdAt: 2,
        id: 'voice-1',
        mimeType: ref.mimeType,
        size: ref.size,
      },
      filename: 'voice.webm',
      requiredReview: { aggregateId: 'review-1', clipId: 'clip-1' },
    })
  );
  expect(writes).toContainEqual([
    'project_assets',
    'put',
    expect.objectContaining({ id: 'voice-1' }),
  ]);
  expect(mocks.discardPrepared).not.toHaveBeenCalled();
});

function createJournal(domain: string, payload: unknown): AssetReadyJournal {
  return {
    assetRefs: [ref],
    createdAt: 2,
    domain,
    journalId: 'journal-1',
    payload,
  };
}

function createTransaction(
  writes: Array<[string, 'delete' | 'put', unknown]>,
  done: Promise<unknown>,
  previous?: unknown,
  mediaValue?: unknown,
  workspace?: VideoWorkspace
) {
  return {
    done,
    abort: vi.fn(),
    objectStore(name: string) {
      return {
        delete: vi.fn(async (value: unknown) => writes.push([name, 'delete', value])),
        getAll: vi.fn(async (): Promise<unknown[]> => []),
        get: vi
          .fn()
          .mockResolvedValue(
            name === 'video_workspaces' && workspace
              ? workspaceStorageHead(workspace, [])
              : name === 'project_assets' || name === 'project_exports'
                ? previous
                : name === 'media_library'
                  ? mediaValue
                  : undefined
          ),
        index: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(0),
          getAll: vi.fn(async () =>
            name === 'video_workspace_history' && workspace ? workspaceStorageRows(workspace) : []
          ),
        })),
        put: vi.fn(async (value: unknown) => writes.push([name, 'put', value])),
      };
    },
  };
}

it('preserves Trash admission when a ready project asset journal is replayed', async () => {
  const writes: Array<[string, 'delete' | 'put', unknown]> = [];
  const media = createMediaLibraryEntry({
    lifecycle: {
      storageClass: 'temporary',
      savedAt: null,
      updatedAt: 1,
      trashedAt: 100,
    },
  });
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({
      transaction: () => createTransaction(writes, Promise.resolve(), undefined, media),
    })
  );
  const entry = {
    assetId: ref.assetId,
    createdAt: 2,
    id: 'asset-1',
    mimeType: ref.mimeType,
    size: ref.size,
  };
  await publishProjectAssetJournal(
    createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, { entry, filename: 'clip.webm' })
  );
  expect(writes).toContainEqual([
    'media_library',
    'put',
    expect.objectContaining({ lifecycle: media.lifecycle }),
  ]);
});

it.each(['publish', 'replay'] as const)(
  'keeps a frozen project representation private during %s',
  async (mode) => {
    const writes: Array<[string, 'delete' | 'put', unknown]> = [];
    mocks.runMutation.mockImplementation(async (operation) =>
      operation({ transaction: () => createTransaction(writes, Promise.resolve()) })
    );
    const entry = {
      id: 'private-copy',
      assetId: ref.assetId,
      createdAt: 2,
      size: ref.size,
      mimeType: ref.mimeType,
    };
    const journal = createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
      entry,
      filename: 'copy.webm',
      publishToLibrary: false,
    });
    if (mode === 'publish') await publishProjectAssetJournal(journal);
    else await projectAssetPublicationAdapter.publish(journal);
    expect(writes).toContainEqual(['project_assets', 'put', entry]);
    expect(writes).toContainEqual([
      'asset_owners',
      'put',
      expect.objectContaining({ ownerId: entry.id, assetId: ref.assetId }),
    ]);
    expect(writes.some(([store]) => store === 'media_library')).toBe(false);
  }
);

it('rejects an invalid private publication flag before writes', async () => {
  const entry = {
    id: 'private-copy',
    assetId: ref.assetId,
    createdAt: 2,
    size: ref.size,
    mimeType: ref.mimeType,
  };
  await expect(
    publishProjectAssetJournal(
      createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
        entry,
        filename: 'copy.webm',
        publishToLibrary: 'false',
      })
    )
  ).rejects.toThrow('Invalid project asset publication payload');
  expect(mocks.runMutation).not.toHaveBeenCalled();
});

it('refuses to turn an already published identity into a private representation before writing', async () => {
  const writes: Array<[string, 'delete' | 'put', unknown]> = [];
  const media = createMediaLibraryEntry();
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: () => createTransaction(writes, Promise.resolve(), undefined, media) })
  );
  const entry = {
    id: 'asset-1',
    assetId: ref.assetId,
    mimeType: ref.mimeType,
    size: ref.size,
    createdAt: 2,
  };
  await expect(
    publishProjectAssetJournal(
      createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
        entry,
        filename: 'image.png',
        publishToLibrary: false,
      })
    )
  ).rejects.toThrow('collides');
  expect(writes).toEqual([]);
});

it.each([undefined, { id: 'origin' }])(
  'refuses private acquisition publication before any write when its origin is unavailable: %j',
  async (origin) => {
    const writes: Array<[string, 'delete' | 'put', unknown]> = [];
    const tx = createTransaction(writes, Promise.resolve());
    const original = tx.objectStore.bind(tx);
    tx.objectStore = (name: string) => ({
      ...original(name),
      get: vi.fn(async (key: string) =>
        name === 'media_library' && key === 'origin' ? origin : undefined
      ),
    });
    mocks.runMutation.mockImplementation(async (operation) => operation({ transaction: () => tx }));
    await expect(
      publishProjectAssetJournal(
        createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
          entry: {
            id: 'copy',
            assetId: ref.assetId,
            createdAt: 2,
            mimeType: ref.mimeType,
            size: ref.size,
            originMediaId: 'origin',
          },
          filename: 'copy.webm',
          publishToLibrary: false,
        })
      )
    ).rejects.toThrow('source is unavailable');
    expect(writes).toEqual([]);
  }
);

it.each(['missing', 'invalid'] as const)(
  'recovery discards only definitively missing acquisition origins: %s',
  async (state) => {
    const writes: Array<[string, 'delete' | 'put', unknown]> = [];
    mocks.runMutation.mockImplementation(async (operation) =>
      operation({
        get: async () => (state === 'missing' ? undefined : { id: 'origin' }),
        transaction: () => createTransaction(writes, Promise.resolve()),
      })
    );
    const journal = createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
      entry: {
        id: 'copy',
        assetId: ref.assetId,
        createdAt: 2,
        mimeType: ref.mimeType,
        size: ref.size,
        originMediaId: 'origin',
      },
      filename: 'copy.webm',
      publishToLibrary: false,
    });
    if (state === 'missing') {
      await expect(projectAssetPublicationAdapter.publish(journal)).rejects.toMatchObject({
        name: 'SupersededAssetPublicationError',
      });
      expect(mocks.discardPrepared).not.toHaveBeenCalled();
    } else {
      await expect(projectAssetPublicationAdapter.publish(journal)).rejects.toThrow(
        'source is invalid'
      );
      expect(mocks.discardPrepared).not.toHaveBeenCalled();
    }
    expect(writes).toEqual([]);
  }
);

it.each(['stale', 'legacy', 'replay'] as const)(
  'keeps an existing source during %s project publication',
  async (mode) => {
    const writes: Array<[string, 'delete' | 'put', unknown]> = [];
    const current = { ...exportEntry, assetId: mode === 'replay' ? ref.assetId : 'later' };
    mocks.runMutation.mockImplementation(async (callback) =>
      callback({ transaction: () => createTransaction(writes, Promise.resolve(), current) })
    );
    const prepared = createJournal(PROJECT_EXPORT_PUBLICATION_DOMAIN, {
      entry: exportEntry,
      ...(mode === 'legacy' ? {} : { expectedAssetId: 'old' }),
    });
    if (mode === 'replay') await publishProjectExportJournal(prepared);
    else
      await expect(publishProjectExportJournal(prepared)).rejects.toMatchObject({
        name:
          mode === 'stale' ? 'SupersededAssetPublicationError' : 'UnresolvedAssetPublicationError',
      });
    expect(writes).toEqual([]);
  }
);

it.each(['voiceover', 'music', 'recovery'] as const)(
  'recovers a staged asset retained as %s after its original clip identity disappeared',
  async (retainedAt) => {
    const { createQuickEditAdvancedState } =
      await import('../../../features/video/review/advanced/defaults');
    const advanced = createQuickEditAdvancedState();
    const copied = {
      id: 'copied',
      assetId: 'project-asset:voice-1',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    };
    if (retainedAt === 'recovery')
      advanced.recoveryV1 = JSON.stringify({
        background: { enabled: false },
        audio: { voiceover: [copied], music: [] },
      });
    else advanced.audio[retainedAt].push(copied);
    mocks.readReview.mockResolvedValue({ workspace: { advanced, history: [] }, draft: null });
    const writes: Array<[string, 'delete' | 'put', unknown]> = [];
    mocks.runMutation.mockImplementation(async (operation) =>
      operation({ transaction: () => createTransaction(writes, Promise.resolve()) })
    );
    await projectAssetPublicationAdapter.publish(
      createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
        entry: {
          assetId: ref.assetId,
          createdAt: 2,
          id: 'voice-1',
          mimeType: ref.mimeType,
          size: ref.size,
        },
        filename: 'voice.webm',
        requiredReview: { aggregateId: 'review-1', clipId: 'original' },
      })
    );
    expect(writes).toContainEqual([
      'project_assets',
      'put',
      expect.objectContaining({ id: 'voice-1' }),
    ]);
  }
);

it('rejects a retained own review before standalone export replacement writes', async () => {
  const writes: Array<[string, 'delete' | 'put', unknown]> = [];
  const transaction = createTransaction(writes, Promise.resolve(), {
    ...exportEntry,
    assetId: 'asset-old',
  });
  const objectStore = transaction.objectStore;
  const review = { aggregateId: `export:${exportEntry.id}` };
  transaction.objectStore = (name) => {
    const store = objectStore(name);
    if (name === 'video_workspaces') {
      store.get.mockResolvedValue(review);
      store.getAll.mockResolvedValue([review]);
    }
    return store;
  };
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: () => transaction })
  );
  await expect(
    publishProjectExportJournal(
      createJournal(PROJECT_EXPORT_PUBLICATION_DOMAIN, {
        entry: exportEntry,
        expectedAssetId: 'asset-old',
      })
    )
  ).rejects.toThrow();
  expect(writes).toEqual([]);
  expect(mocks.completeDelete).not.toHaveBeenCalled();
});

it('validates marked Library claims without weakening legacy publication payloads', async () => {
  const { parseProjectAssetPayload } = await import('./asset-publication-payload');
  const entry = { id: 'audio', assetId: 'bytes', createdAt: 1, mimeType: 'audio/webm', size: 5 };
  const direct = {
    entry,
    filename: 'music.webm',
    librarySourceId: 'project-asset:audio',
    expectedAssetId: 'bytes',
    requiredReview: { aggregateId: 'main', clipId: 'music' },
  };
  expect(parseProjectAssetPayload(direct)).toEqual(direct);
  const privateClaim = {
    ...direct,
    entry: { ...entry, id: 'private', originMediaId: 'stored:audio' },
    librarySourceId: 'stored:audio',
    expectedAssetId: null,
    publishToLibrary: false,
  };
  expect(parseProjectAssetPayload(privateClaim)).toEqual(privateClaim);
  for (const invalid of [
    { ...direct, expectedAssetId: null },
    { ...direct, publishToLibrary: false },
    { ...direct, requiredReview: undefined },
    { ...direct, requiredReview: { aggregateId: 'main', clipId: '' } },
    { ...direct, entry: { ...entry, mimeType: 'video/webm' } },
    { ...privateClaim, publishToLibrary: true },
    { ...privateClaim, librarySourceId: 'unrelated' },
  ])
    expect(parseProjectAssetPayload(invalid)).toBeNull();
});

it('admits only private image publications with an exclusive watermark recovery slot', async () => {
  const { parseProjectAssetPayload } = await import('./asset-publication-payload');
  const payload = {
    entry: { id: 'logo', assetId: 'bytes', createdAt: 1, mimeType: 'image/png', size: 5 },
    filename: 'logo.png',
    expectedAssetId: null,
    publishToLibrary: false,
    requiredReviewResource: { aggregateId: 'review', slot: 'watermark' },
  };
  expect(parseProjectAssetPayload(payload)).toEqual(payload);
  for (const invalid of [
    { ...payload, requiredReview: { aggregateId: 'review', clipId: 'audio' } },
    { ...payload, requiredReviewResource: { aggregateId: '', slot: 'watermark' } },
    { ...payload, requiredReviewResource: { aggregateId: 'review', slot: 'background' } },
    { ...payload, publishToLibrary: true },
    { ...payload, publishToLibrary: undefined },
    { ...payload, librarySourceId: 'source' },
    { ...payload, entry: { ...payload.entry, mimeType: 'audio/webm' } },
  ])
    expect(parseProjectAssetPayload(invalid)).toBeNull();
});

it.each(['current', 'history', 'recovery', 'wrong-slot', 'missing'] as const)(
  'recovers a private image only from its exact retained watermark slot: %s',
  async (location) => {
    const writes: Array<[string, 'delete' | 'put', unknown]> = [];
    const image = { assetId: 'project-asset:logo' };
    const empty = { audio: { voiceover: [], music: [] } };
    const remembered = { ...empty, watermark: { mode: 'none', image } };
    const advanced =
      location === 'current'
        ? remembered
        : location === 'recovery'
          ? { ...empty, recoveryV1: JSON.stringify(remembered) }
          : location === 'wrong-slot'
            ? { ...empty, background: { type: 'image', ...image } }
            : empty;
    mocks.readReview.mockResolvedValue({
      workspace: {
        advanced,
        history:
          location === 'history'
            ? [{ target: 'advancedContent', before: empty, after: remembered }]
            : [],
      },
    });
    mocks.runMutation.mockImplementation(async (operation) =>
      operation({ transaction: () => createTransaction(writes, Promise.resolve()) })
    );
    const journal = createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
      entry: { id: 'logo', assetId: ref.assetId, createdAt: 1, mimeType: 'image/png', size: 5 },
      filename: 'logo.png',
      expectedAssetId: null,
      publishToLibrary: false,
      requiredReviewResource: { aggregateId: 'review', slot: 'watermark' },
    });
    journal.assetRefs = [{ ...ref, mimeType: 'image/png' }];
    const recovery = projectAssetPublicationAdapter.publish(journal);
    if (location === 'wrong-slot' || location === 'missing') {
      await expect(recovery).rejects.toThrow('superseded');
      expect(writes).toEqual([]);
    } else {
      await recovery;
      expect(writes).toContainEqual([
        'project_assets',
        'put',
        expect.objectContaining({ id: 'logo' }),
      ]);
      expect(writes.some(([store]) => store === 'media_library')).toBe(false);
    }
    expect(mocks.readReview).toHaveBeenCalledWith('review');
  }
);

it.each(['intro', 'outro'] as const)(
  'recovers a scene video only from its exact retained %s kind, including history under none',
  async (slot) => {
    const writes: Array<[string, 'delete' | 'put', unknown]> = [];
    const content = {
      presentation: { [slot]: { mode: 'none', video: { assetId: 'project-asset:scene' } } },
    };
    mocks.readReview.mockResolvedValue({
      workspace: {
        advanced: {},
        history: [{ target: 'advancedContent', before: {}, after: content }],
      },
    });
    mocks.runMutation.mockImplementation(async (operation) =>
      operation({ transaction: () => createTransaction(writes, Promise.resolve()) })
    );
    const payload = {
      entry: {
        assetId: ref.assetId,
        createdAt: 2,
        id: 'scene',
        mimeType: ref.mimeType,
        size: ref.size,
      },
      filename: 'scene.webm',
      expectedAssetId: null,
      publishToLibrary: false,
      requiredReviewResource: {
        aggregateId: 'review-1',
        slot,
        kind: 'video',
        acquisition: 'private-upload',
      },
    };
    await projectAssetPublicationAdapter.publish(
      createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, payload)
    );
    expect(writes).toContainEqual([
      'project_assets',
      'put',
      expect.objectContaining({ id: 'scene' }),
    ]);
    writes.length = 0;
    await expect(
      projectAssetPublicationAdapter.publish(
        createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
          ...payload,
          requiredReviewResource: {
            ...payload.requiredReviewResource,
            slot: slot === 'intro' ? 'outro' : 'intro',
          },
        })
      )
    ).rejects.toMatchObject({ name: 'SupersededAssetPublicationError' });
    expect(writes).toEqual([]);
    expect(mocks.discardPrepared).not.toHaveBeenCalled();
  }
);

it('rejects incompatible scene claim payloads without relaxing watermark or audio claims', async () => {
  const { parseProjectAssetPayload } = await import('./asset-publication-payload');
  const payload = {
    entry: {
      assetId: ref.assetId,
      createdAt: 2,
      id: 'scene',
      mimeType: ref.mimeType,
      size: ref.size,
    },
    filename: 'scene.webm',
    expectedAssetId: null,
    publishToLibrary: false,
    requiredReviewResource: {
      aggregateId: 'review-1',
      slot: 'intro',
      kind: 'video',
      acquisition: 'private-upload',
    },
  };
  expect(parseProjectAssetPayload(payload)).not.toBeNull();
  for (const patch of [
    { publishToLibrary: true },
    { requiredReview: { aggregateId: 'review-1', clipId: 'audio' } },
    { librarySourceId: 'unclaimed-library-source' },
    { requiredReviewResource: { ...payload.requiredReviewResource, kind: 'image' } },
    {
      requiredReviewResource: {
        ...payload.requiredReviewResource,
        acquisition: 'private-frozen-image',
      },
    },
    {
      requiredReviewResource: { ...payload.requiredReviewResource, acquisition: 'library-binding' },
    },
    { requiredReviewResource: { aggregateId: 'review-1', slot: 'watermark' } },
  ])
    expect(parseProjectAssetPayload({ ...payload, ...patch })).toBeNull();
  const direct = {
    ...payload,
    expectedAssetId: ref.assetId,
    publishToLibrary: true,
    librarySourceId: 'project-asset:scene',
    requiredReviewResource: { ...payload.requiredReviewResource, acquisition: 'library-binding' },
  };
  expect(parseProjectAssetPayload(direct)).not.toBeNull();
  expect(parseProjectAssetPayload({ ...direct, expectedAssetId: null })).toBeNull();
  expect(parseProjectAssetPayload({ ...direct, publishToLibrary: false })).toBeNull();
});

it('strictly binds generated speech to one private exact target and replacement', async () => {
  const { parseProjectAssetPayload } = await import('./asset-publication-payload');
  const payload = {
    entry: { id: 'speech', assetId: 'bytes', mimeType: 'audio/wav', createdAt: 1, size: 4 },
    filename: 'speech',
    publishToLibrary: false,
    requiredReviewSpeech: {
      aggregateId: 'review',
      target: { kind: 'original' },
      replacementId: 'accepted',
    },
  };
  expect(parseProjectAssetPayload(payload)).toMatchObject({
    requiredReviewSpeech: payload.requiredReviewSpeech,
  });
  for (const patch of [
    { publishToLibrary: true },
    { entry: { ...payload.entry, mimeType: 'image/png' } },
    { requiredReview: { aggregateId: 'review', clipId: 'clip' } },
    { requiredReviewResource: { aggregateId: 'review', slot: 'watermark' } },
    { librarySourceId: 'other' },
    { requiredReviewSpeech: { ...payload.requiredReviewSpeech, replacementId: '' } },
    {
      requiredReviewSpeech: {
        ...payload.requiredReviewSpeech,
        target: { kind: 'original', clipId: 'clip' },
      },
    },
  ])
    expect(parseProjectAssetPayload({ ...payload, ...patch })).toBeNull();
});

it.each(['original', 'voiceover'] as const)(
  'recovers %s speech after Undo only for its exact accepted identity',
  async (kind) => {
    const target = kind === 'original' ? { kind } : { kind, clipId: 'voice' };
    const replacement = { id: 'accepted', assetId: 'project-asset:speech' };
    const transcript = { replacements: [replacement] };
    const content = {
      audio:
        kind === 'original'
          ? { originalSpeech: { enabled: false, transcript } }
          : { voiceover: [{ id: 'voice', transcript }] },
    };
    mocks.readReview.mockResolvedValue({
      workspace: {
        advanced: {},
        cursor: 0,
        history: [{ target: 'advancedContent', before: {}, after: content }],
      },
    });
    const writes: Array<[string, 'delete' | 'put', unknown]> = [];
    mocks.runMutation.mockImplementation(async (operation) =>
      operation({ transaction: () => createTransaction(writes, Promise.resolve()) })
    );
    const payload = {
      entry: {
        assetId: ref.assetId,
        createdAt: 2,
        id: 'speech',
        mimeType: 'audio/wav',
        size: ref.size,
      },
      filename: 'speech.wav',
      expectedAssetId: null,
      publishToLibrary: false,
      requiredReviewSpeech: { aggregateId: 'review', target, replacementId: 'accepted' },
    };
    await projectAssetPublicationAdapter.publish(
      createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, payload)
    );
    expect(writes).toContainEqual([
      'project_assets',
      'put',
      expect.objectContaining({ id: 'speech' }),
    ]);
    expect(writes.some(([store]) => store === 'media_library')).toBe(false);
    writes.length = 0;
    await expect(
      projectAssetPublicationAdapter.publish(
        createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
          ...payload,
          requiredReviewSpeech: { ...payload.requiredReviewSpeech, replacementId: 'unrelated' },
        })
      )
    ).rejects.toMatchObject({ name: 'SupersededAssetPublicationError' });
    expect(writes).toEqual([]);
    expect(mocks.discardPrepared).not.toHaveBeenCalled();
  }
);

it.each(['purged', 'changed-source', 'unreferenced', 'changed-resource'] as const)(
  'refuses a stale direct annotation claim after %s before writing ownership',
  async (change) => {
    const fixture = annotationRecoveryFixture(0);
    mocks.readReview.mockResolvedValue({ workspace: fixture.workspace });
    const current =
      change === 'purged'
        ? undefined
        : {
            ...fixture.workspace,
            ...(change === 'changed-source' ? { sourceAssetId: 'new-source' } : {}),
            ...(change === 'unreferenced' ? { history: [] } : {}),
            ...(change === 'changed-resource'
              ? {
                  effectSnapshots: (fixture.workspace.effectSnapshots ?? []).map((snapshot) => ({
                    ...snapshot,
                    assets: snapshot.assets.map((asset) => ({
                      ...asset,
                      assetId: 'project-asset:other',
                    })),
                  })),
                }
              : {}),
          };
    const writes: Array<[string, 'delete' | 'put', unknown]> = [];
    const tx = createTransaction(writes, Promise.resolve(), undefined, undefined, current);
    mocks.runMutation.mockImplementation(async (operation) => operation({ transaction: () => tx }));
    await expect(publishProjectAssetJournal(fixture.journal)).rejects.toMatchObject({
      name: 'SupersededAssetPublicationError',
    });
    expect(writes).toEqual([]);
    expect(tx.abort).toHaveBeenCalledOnce();
    expect(mocks.readReview).not.toHaveBeenCalled();
  }
);

it.each([0, 1])(
  'directly publishes an exact disabled retained claim at history cursor %i',
  async (cursor) => {
    const fixture = annotationRecoveryFixture(cursor);
    const writes: Array<[string, 'delete' | 'put', unknown]> = [];
    mocks.runMutation.mockImplementation(async (operation) =>
      operation({
        transaction: () =>
          createTransaction(writes, Promise.resolve(), undefined, undefined, fixture.workspace),
      })
    );
    await publishProjectAssetJournal(fixture.journal);
    expect(writes).toContainEqual(['project_assets', 'put', fixture.entry]);
    expect(writes.some(([store]) => store === 'media_library')).toBe(false);
    expect(mocks.readReview).not.toHaveBeenCalled();
  }
);
