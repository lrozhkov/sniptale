import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  abort: vi.fn(),
  create: vi.fn(),
  inspect: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  recover: vi.fn(),
}));

vi.mock('../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/assets')>()),
  abortArchiveRestoreSession: mocks.abort,
  createArchiveRestoreSession: mocks.create,
  listArchiveRestoreSessions: mocks.list,
  readArchiveRestoreSession: mocks.read,
}));
vi.mock('./inspect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./inspect')>()),
  inspectMediaHubBackupV6: mocks.inspect,
}));
vi.mock('../../../composition/persistence/asset-publication-recovery', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/asset-publication-recovery')
  >()),
  recoverAssetPublications: mocks.recover,
}));

import {
  abortMediaHubBackupRestore,
  createMediaHubRestoreSession,
  listResumableMediaHubRestores,
  readMediaHubRestoreSummary,
  verifyMediaHubRestoreResume,
} from './restore-session';

const session = {
  archiveFingerprint: 'a'.repeat(64),
  committedRoots: ['media:library-item:one'],
  conflictedRoots: [],
  createdAt: 1,
  currentRoot: null,
  kind: 'archive-restore-session' as const,
  operationId: 'restore-1',
  rootIdMap: { 'media:library-item:one': 'one-copy' },
  skippedRoots: [],
  status: 'pending' as const,
  strategy: 'duplicate' as const,
  updatedAt: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inspect.mockResolvedValue({
    fingerprint: session.archiveFingerprint,
    manifest: {},
    rootKeys: [],
  });
  mocks.create.mockResolvedValue(session);
  mocks.recover.mockResolvedValue(0);
  mocks.read.mockResolvedValue(session);
  mocks.list.mockResolvedValue([session, { ...session, operationId: 'done', status: 'completed' }]);
});

describe('media backup v6 restore sessions', () => {
  it('persists strategy and validated fingerprint before restore writes', async () => {
    const result = await createMediaHubRestoreSession({
      file: new Blob(['zip']),
      strategy: 'duplicate',
    });
    expect(mocks.inspect).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith({
      archiveFingerprint: session.archiveFingerprint,
      strategy: 'duplicate',
    });
    expect(result.session).toBe(session);
  });

  it('requires the same central-directory fingerprint on resume', async () => {
    await expect(
      verifyMediaHubRestoreResume({ file: new Blob(['zip']), operationId: session.operationId })
    ).resolves.toMatchObject({ session });
    expect(mocks.recover.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.read.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    mocks.inspect.mockResolvedValue({ fingerprint: 'b'.repeat(64), manifest: {}, rootKeys: [] });
    await expect(
      verifyMediaHubRestoreResume({ file: new Blob(['other']), operationId: session.operationId })
    ).rejects.toThrow('does not match');
  });

  it('lists pending sessions only and aborts explicitly', async () => {
    await expect(listResumableMediaHubRestores()).resolves.toEqual([
      expect.objectContaining({ committedRootCount: 1, operationId: 'restore-1' }),
    ]);
    await abortMediaHubBackupRestore('restore-1');
    expect(mocks.abort).toHaveBeenCalledWith('restore-1');
  });

  it('reads terminal session counts for exact partial failure reporting', async () => {
    mocks.read.mockResolvedValue({ ...session, status: 'aborted' });
    await expect(readMediaHubRestoreSummary('restore-1')).resolves.toMatchObject({
      committedRootCount: 1,
      operationId: 'restore-1',
      status: 'aborted',
    });
  });

  it('runs canonical crash recovery before exposing an interrupted root for resume', async () => {
    const interrupted = { ...session, currentRoot: 'media:library-item:two' };
    mocks.list.mockImplementation(async () => {
      expect(mocks.recover).toHaveBeenCalledOnce();
      return [{ ...interrupted, currentRoot: null }];
    });

    await expect(listResumableMediaHubRestores()).resolves.toEqual([
      expect.objectContaining({ currentRoot: null, operationId: 'restore-1' }),
    ]);
  });
});
