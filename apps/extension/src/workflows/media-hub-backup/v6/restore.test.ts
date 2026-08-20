import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  abortSession: vi.fn(),
  beginRoot: vi.fn(),
  completeSession: vi.fn(),
  createJournal: vi.fn(),
  deleteJournal: vi.fn(),
  discard: vi.fn(),
  publishJournal: vi.fn(),
  readSession: vi.fn(),
  stage: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/assets')>()),
  abortArchiveRestoreSession: mocks.abortSession,
  beginArchiveRestoreRoot: mocks.beginRoot,
  completeArchiveRestoreSession: mocks.completeSession,
  createAssetPublicationJournal: mocks.createJournal,
  deleteReadyJournal: mocks.deleteJournal,
  discardPreparedAsset: mocks.discard,
  publishReadyJournalWithRetry: mocks.publishJournal,
  readArchiveRestoreSession: mocks.readSession,
}));
vi.mock('./restore-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./restore-session')>()),
  verifyMediaHubRestoreResume: mocks.verify,
}));
vi.mock('./staging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./staging')>()),
  stageArchiveRootObjects: mocks.stage,
}));

import { createArchiveWriter } from '../../../composition/archive-transfer';
import { createArchiveMemorySink } from '../../../composition/archive-transfer/test-support';
import { runWithDurableAssetOperationRecovery } from '../../../composition/persistence/infrastructure/mutation-barrier';
import { restoreMediaHubBackupV6 } from './restore';

const descriptor = {
  mediaSubtype: 'library-item' as const,
  metadataPath: 'metadata/media/one.json',
  objectCount: 1,
  rootId: 'one',
  rootKind: 'media' as const,
  totalBytes: 5,
};
const object = {
  filename: 'one.bin',
  mimeType: 'application/octet-stream',
  objectId: 'object-one',
  path: 'objects/object-one/one.bin',
  size: 5,
};
const catalogPath = 'catalog/media-000001.ndjson';
let currentSession: {
  archiveFingerprint: string;
  committedRoots: string[];
  conflictedRoots: string[];
  createdAt: number;
  currentRoot: string | null;
  kind: 'archive-restore-session';
  operationId: string;
  rootIdMap: Record<string, string>;
  skippedRoots: string[];
  status: 'pending' | 'completed' | 'aborted';
  strategy: 'duplicate' | 'skip';
  updatedAt: number;
};

async function archive(): Promise<Blob> {
  const output = createArchiveMemorySink();
  const writer = createArchiveWriter(output.sink);
  await writer.addText('manifest.json', '{}');
  await writer.addText(catalogPath, `${JSON.stringify(descriptor)}\n`);
  await writer.addText(
    descriptor.metadataPath,
    JSON.stringify({ descriptor, metadata: {}, objects: [object] })
  );
  await writer.addBlob(object.path, new Blob(['media']));
  await writer.close();
  return output.blob();
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSession = {
    archiveFingerprint: 'a'.repeat(64),
    committedRoots: [],
    conflictedRoots: [],
    createdAt: 1,
    currentRoot: null,
    kind: 'archive-restore-session',
    operationId: 'restore-1',
    rootIdMap: {},
    skippedRoots: [],
    status: 'pending',
    strategy: 'duplicate',
    updatedAt: 1,
  };
  mocks.verify.mockResolvedValue({
    inspection: { manifest: { catalogs: [{ path: catalogPath }] } },
    session: currentSession,
  });
  mocks.beginRoot.mockImplementation(async (_operationId, root) => {
    currentSession = { ...currentSession, currentRoot: root };
    return currentSession;
  });
  mocks.stage.mockResolvedValue([
    {
      objectId: object.objectId,
      ref: {
        assetId: 'local-asset',
        createdAt: 1,
        location: { kind: 'opfs', objectKey: 'objects/local-asset' },
        mimeType: object.mimeType,
        sha256: null,
        size: 5,
      },
    },
  ]);
  mocks.createJournal.mockResolvedValue({
    assetRefs: [],
    createdAt: 1,
    domain: 'archive-restore-root',
    journalId: 'journal-1',
    operationId: 'restore-1',
    payload: {},
  });
  mocks.publishJournal.mockImplementation(async (journal, publish) => publish(journal));
  mocks.readSession.mockImplementation(async () => currentSession);
  mocks.completeSession.mockImplementation(async () => {
    currentSession = { ...currentSession, status: 'completed' };
    return currentSession;
  });
  mocks.discard.mockResolvedValue(undefined);
  mocks.deleteJournal.mockResolvedValue(undefined);
  mocks.abortSession.mockResolvedValue(undefined);
});

describe('media backup v6 restore orchestration', () => {
  it('publishes one root and completes only after the atomic session checkpoint', async () => {
    const publisher = {
      profile: 'media:library-item',
      async publish() {
        currentSession = {
          ...currentSession,
          committedRoots: ['media:library-item:one'],
          currentRoot: null,
        };
        return { conflicted: false, imported: true, retainedAssetIds: ['local-asset'] };
      },
    };
    await expect(
      restoreMediaHubBackupV6({
        file: await archive(),
        operationId: 'restore-1',
        publishers: [publisher],
      })
    ).resolves.toMatchObject({ status: 'completed' });
    expect(mocks.verify).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'restore-1', permit: expect.any(Object) })
    );
    expect(mocks.beginRoot).toHaveBeenCalledWith('restore-1', 'media:library-item:one');
    expect(mocks.completeSession).toHaveBeenCalledOnce();
    expect(mocks.discard).not.toHaveBeenCalled();
  });

  it('keeps recovery queued until the active restore completes', async () => {
    let releasePublication!: () => void;
    let publicationStarted!: () => void;
    const publicationGate = new Promise<void>((resolve) => {
      releasePublication = resolve;
    });
    const started = new Promise<void>((resolve) => {
      publicationStarted = resolve;
    });
    const publisher = {
      profile: 'media:library-item',
      async publish() {
        publicationStarted();
        await publicationGate;
        currentSession = {
          ...currentSession,
          committedRoots: ['media:library-item:one'],
          currentRoot: null,
        };
        return { conflicted: false, imported: true, retainedAssetIds: ['local-asset'] };
      },
    };
    const restore = restoreMediaHubBackupV6({
      file: await archive(),
      operationId: 'restore-1',
      publishers: [publisher],
    });
    await started;
    const recoveryOperation = vi.fn();
    const recovery = runWithDurableAssetOperationRecovery(undefined, recoveryOperation);
    await Promise.resolve();
    expect(recoveryOperation).not.toHaveBeenCalled();

    releasePublication();
    await expect(restore).resolves.toMatchObject({ status: 'completed' });
    await recovery;
    expect(recoveryOperation).toHaveBeenCalledOnce();
  });

  it('journals only the domain-validated staged objects', async () => {
    const replacement = {
      objectId: object.objectId,
      ref: {
        assetId: 'sanitized-asset',
        createdAt: 2,
        location: { kind: 'opfs' as const, objectKey: 'objects/sanitized-asset' },
        mimeType: object.mimeType,
        sha256: null,
        size: 5,
      },
    };
    const publisher = {
      profile: 'media:library-item',
      prepareStaged: vi.fn(async ({ envelope }) => ({ envelope, staged: [replacement] })),
      async publish() {
        currentSession = {
          ...currentSession,
          committedRoots: ['media:library-item:one'],
          currentRoot: null,
        };
        return { conflicted: false, imported: true, retainedAssetIds: ['sanitized-asset'] };
      },
    };

    await restoreMediaHubBackupV6({
      file: await archive(),
      operationId: 'restore-1',
      publishers: [publisher],
    });

    expect(publisher.prepareStaged).toHaveBeenCalledOnce();
    expect(mocks.createJournal).toHaveBeenCalledWith(
      expect.objectContaining({ assetRefs: [replacement.ref] })
    );
  });

  it('does not erase a root whose transaction committed before cleanup failed', async () => {
    const publisher = {
      profile: 'media:library-item',
      async publish() {
        currentSession = {
          ...currentSession,
          committedRoots: ['media:library-item:one'],
          currentRoot: null,
        };
        throw new Error('post-commit interruption');
      },
    };
    await expect(
      restoreMediaHubBackupV6({
        file: await archive(),
        operationId: 'restore-1',
        publishers: [publisher],
      })
    ).resolves.toMatchObject({ status: 'completed' });
    expect(mocks.discard).not.toHaveBeenCalled();
    expect(mocks.abortSession).not.toHaveBeenCalled();
  });

  it('aborts and removes only the uncommitted current root on publication failure', async () => {
    const publisher = {
      profile: 'media:library-item',
      publish: vi.fn().mockRejectedValue(new Error('transaction failed')),
    };
    await expect(
      restoreMediaHubBackupV6({
        file: await archive(),
        operationId: 'restore-1',
        publishers: [publisher],
      })
    ).rejects.toThrow('transaction failed');
    expect(mocks.discard).toHaveBeenCalledWith('local-asset');
    expect(mocks.abortSession).toHaveBeenCalledWith('restore-1');
  });

  it('checkpoints an existing skipped root without staging its bytes', async () => {
    currentSession = { ...currentSession, strategy: 'skip' };
    const publisher = {
      profile: 'media:library-item',
      async checkpointSkipIfExisting() {
        currentSession = {
          ...currentSession,
          committedRoots: ['media:library-item:one'],
          conflictedRoots: ['media:library-item:one'],
          currentRoot: null,
          rootIdMap: { 'media:library-item:one': 'one' },
          skippedRoots: ['media:library-item:one'],
        };
        return true;
      },
      publish: vi.fn(),
    };
    await expect(
      restoreMediaHubBackupV6({
        file: await archive(),
        operationId: 'restore-1',
        publishers: [publisher],
      })
    ).resolves.toMatchObject({ status: 'completed' });
    expect(mocks.stage).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
