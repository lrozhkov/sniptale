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
  mediaValue?: unknown
) {
  return {
    done,
    objectStore(name: string) {
      return {
        delete: vi.fn(async (value: unknown) => writes.push([name, 'delete', value])),
        getAll: vi.fn(async (): Promise<unknown[]> => []),
        get: vi
          .fn()
          .mockResolvedValue(
            name === 'project_assets' || name === 'project_exports'
              ? previous
              : name === 'media_library'
                ? mediaValue
                : undefined
          ),
        index: vi.fn(() => ({ count: vi.fn().mockResolvedValue(0) })),
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
