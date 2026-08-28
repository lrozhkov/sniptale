import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  cancelCapture: vi.fn(),
  close: vi.fn(),
  commit: vi.fn(),
  clearCleanupAssets: vi.fn(),
  consume: vi.fn(),
  deleteAssets: vi.fn(),
  hasAccess: vi.fn(),
  open: vi.fn(),
  readAssetFile: vi.fn(),
  readRecovery: vi.fn(),
  recordCleanupAsset: vi.fn(),
  recoverPublications: vi.fn(),
  retain: vi.fn(),
  save: vi.fn(),
  screenshotPipeTo: vi.fn(),
}));

vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  readAssetFile: mocks.readAssetFile,
}));
vi.mock('../../../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../page-access/service')>()),
  hasActivePageAccess: mocks.hasAccess,
}));
vi.mock('../../../media-hub/web-snapshot', () => ({
  saveWebSnapshotToMediaHub: mocks.save,
}));
vi.mock('../../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../workflows/media-hub/store')>()),
  deleteMediaLibraryAssetsBatchSafely: mocks.deleteAssets,
}));
vi.mock('../../../../composition/persistence/web-snapshots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/web-snapshots')>()),
  recoverWebSnapshotPublications: mocks.recoverPublications,
}));
vi.mock('../../../capture/routing/web-snapshot/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture/routing/web-snapshot/session')>()),
  beginWebSnapshotSave: mocks.begin,
  cancelWebSnapshotCaptureRequest: mocks.cancelCapture,
  commitWebSnapshotSave: mocks.commit,
  retainWebSnapshotSaveAfterCompensationFailure: mocks.retain,
}));
vi.mock('./stage-route', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./stage-route')>()),
  pagePackageJobStaging: { consume: mocks.consume },
}));
vi.mock('./page-boundary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./page-boundary')>()),
  openStagedPagePackage: mocks.open,
}));
vi.mock('./storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./storage')>()),
  clearPagePackageLibraryCleanupAssets: mocks.clearCleanupAssets,
  readPagePackageJobRecoveryState: mocks.readRecovery,
  recordPagePackageLibraryCleanupAsset: mocks.recordCleanupAsset,
}));

import { cleanupRecordedPagePackageLibraryAssets, saveCollectedPagePackages } from './library';
const activeSignal = new AbortController().signal;

function screenshotSource(bytes = new Uint8Array([1, 2, 3])) {
  return {
    compressedSize: bytes.byteLength,
    crc32: 0,
    directory: false,
    path: 'web-copy/screenshot.png',
    size: bytes.byteLength,
    async pipeTo(writable: WritableStream<Uint8Array>, signal: AbortSignal) {
      mocks.screenshotPipeTo(signal);
      const writer = writable.getWriter();
      await writer.write(bytes);
      await writer.close();
    },
    async text() {
      return '';
    },
  };
}

function collected(ordinal: number, tabId: number) {
  return {
    descriptor: {
      jobId: 'job-1',
      manifestSha256: 'a'.repeat(64),
      manifestSize: 10,
      ordinal,
      pageId: `page-${ordinal}`,
      producerStats: { filesCount: 3, filesFailed: 0, rowsCount: 0, sectionsCount: 2 },
      snapshotSessionId: `session-${ordinal}`,
      stagedBlobId: `stage-${ordinal}`,
      title: `Page ${ordinal}`,
      totalBytes: 20,
    },
    tab: { tabId, title: `Page ${ordinal}` },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  let nextAssetId = 0;
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(
    () => `asset-${++nextAssetId}` as ReturnType<Crypto['randomUUID']>
  );
  mocks.close.mockResolvedValue(undefined);
  mocks.consume.mockResolvedValue({ prepared: { ref: { kind: 'test' } } });
  mocks.readAssetFile.mockResolvedValue(new File(['package'], 'page-package.zip'));
  mocks.hasAccess.mockResolvedValue(true);
  mocks.open.mockResolvedValue({
    pagePackage: { manifest: { intent: 'save' } },
    reader: { close: mocks.close, entry: () => screenshotSource() },
  });
  mocks.save.mockImplementation(async (input) => input.assetId);
  mocks.deleteAssets.mockResolvedValue(undefined);
  mocks.clearCleanupAssets.mockResolvedValue(undefined);
  mocks.recordCleanupAsset.mockResolvedValue(undefined);
  mocks.readRecovery.mockResolvedValue({
    jobId: 'job-1',
    libraryCleanupAssetIds: [],
    output: null,
    stagedPages: [],
    status: {},
  });
  mocks.recoverPublications.mockResolvedValue(0);
  mocks.cancelCapture.mockReturnValue({
    committedAssetIds: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('publishes a staged Save package through the existing journaled Library owner', async () => {
  const result = await saveCollectedPagePackages({
    signal: activeSignal,
    jobId: 'job-1',
    packages: [collected(0, 7)],
  });

  expect(result).toEqual({ failures: [], snapshotIds: ['asset-1'] });
  expect(mocks.open).toHaveBeenCalledWith(expect.any(File), expect.any(Object), activeSignal);
  expect(mocks.screenshotPipeTo).toHaveBeenCalledWith(activeSignal);
  expect(mocks.begin).toHaveBeenCalledWith({ sessionId: 'session-0', tabId: 7 });
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      assetId: 'asset-1',
      assertPersistenceAllowed: expect.any(Function),
      packageBlob: expect.any(File),
      payload: expect.objectContaining({ snapshotSessionId: 'session-0' }),
      screenshotBlob: expect.any(Blob),
    })
  );
  expect(mocks.commit).toHaveBeenCalledWith({
    assetId: 'asset-1',
    sessionId: 'session-0',
    tabId: 7,
  });
  expect(mocks.recordCleanupAsset).toHaveBeenCalledWith('job-1', 'asset-1');
  expect(mocks.recordCleanupAsset.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.save.mock.invocationCallOrder[0]!
  );
  expect(mocks.clearCleanupAssets).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledOnce();
});

it('continues sequential publication after one page fails', async () => {
  mocks.save.mockRejectedValueOnce(new Error('quota reached')).mockResolvedValueOnce('asset-2');

  const result = await saveCollectedPagePackages({
    signal: activeSignal,
    jobId: 'job-1',
    packages: [collected(0, 7), collected(1, 8)],
  });

  expect(result).toEqual({
    failures: [{ error: 'quota reached', ordinal: 0, tabId: 7 }],
    snapshotIds: ['asset-2'],
  });
  expect(mocks.cancelCapture).toHaveBeenCalledWith(7, 'job-1');
  expect(mocks.save).toHaveBeenCalledTimes(2);
});

it('keeps earlier and later successes when one middle page fails', async () => {
  const retained = new Set<string>();
  mocks.recordCleanupAsset.mockImplementation(async (_jobId, assetId) => {
    retained.add(assetId);
  });
  mocks.clearCleanupAssets.mockImplementation(async (_jobId, assetIds) => {
    for (const assetId of assetIds) retained.delete(assetId);
  });
  mocks.save
    .mockImplementationOnce(async (input) => input.assetId)
    .mockRejectedValueOnce(new Error('quota reached'))
    .mockImplementationOnce(async (input) => input.assetId);

  const result = await saveCollectedPagePackages({
    signal: activeSignal,
    jobId: 'job-1',
    packages: [collected(0, 7), collected(1, 8), collected(2, 9)],
  });

  expect(result).toEqual({
    failures: [{ error: 'quota reached', ordinal: 1, tabId: 8 }],
    snapshotIds: ['asset-1', 'asset-3'],
  });
  expect(retained).toEqual(new Set(['asset-1', 'asset-3']));
  expect(mocks.deleteAssets).toHaveBeenCalledWith(['asset-2']);
  expect(mocks.deleteAssets).not.toHaveBeenCalledWith(['asset-1']);
});

it('compensates the Library asset when session commit fails', async () => {
  mocks.commit.mockImplementationOnce(() => {
    throw new Error('capture cancelled');
  });

  const result = await saveCollectedPagePackages({
    signal: activeSignal,
    jobId: 'job-1',
    packages: [collected(0, 7)],
  });

  expect(result.failures).toEqual([{ error: 'capture cancelled', ordinal: 0, tabId: 7 }]);
  expect(result.snapshotIds).toEqual([]);
  expect(mocks.deleteAssets).toHaveBeenCalledWith(['asset-1']);
  expect(mocks.cancelCapture).toHaveBeenCalledWith(7, 'job-1');
});

it('retains asset authority when commit and deletion compensation both fail', async () => {
  mocks.commit.mockImplementationOnce(() => {
    throw new Error('capture cancelled');
  });
  mocks.deleteAssets.mockRejectedValue(new Error('delete unavailable'));

  const result = await saveCollectedPagePackages({
    signal: activeSignal,
    jobId: 'job-1',
    packages: [collected(0, 7)],
  });

  expect(result.failures[0]?.error).toContain('capture cleanup was incomplete');
  expect(mocks.retain).toHaveBeenCalledWith({
    assetId: 'asset-1',
    sessionId: 'session-0',
    tabId: 7,
  });
  expect(mocks.recordCleanupAsset).toHaveBeenCalledWith('job-1', 'asset-1');
  expect(mocks.clearCleanupAssets).not.toHaveBeenCalled();
  expect(mocks.cancelCapture).toHaveBeenCalledWith(7, 'job-1');
});

it('clears restart-safe Library authority only after the retained asset deletion succeeds', async () => {
  mocks.readRecovery.mockResolvedValue({
    jobId: 'job-1',
    libraryCleanupAssetIds: ['asset-1'],
    output: null,
    stagedPages: [],
    status: {},
  });
  mocks.deleteAssets.mockRejectedValueOnce(new Error('delete unavailable'));

  await expect(cleanupRecordedPagePackageLibraryAssets('job-1')).rejects.toThrow(
    'delete unavailable'
  );
  expect(mocks.clearCleanupAssets).not.toHaveBeenCalled();

  await cleanupRecordedPagePackageLibraryAssets('job-1');
  expect(mocks.deleteAssets).toHaveBeenCalledTimes(2);
  expect(mocks.recoverPublications.mock.invocationCallOrder[1]).toBeLessThan(
    mocks.deleteAssets.mock.invocationCallOrder[1]!
  );
  expect(mocks.clearCleanupAssets).toHaveBeenCalledWith('job-1', ['asset-1']);
});

it('rejects an oversized screenshot before allocating or publishing it', async () => {
  mocks.open.mockResolvedValueOnce({
    pagePackage: { manifest: { intent: 'save' } },
    reader: {
      close: mocks.close,
      entry: () => ({ ...screenshotSource(), size: 25 * 1024 * 1024 + 1 }),
    },
  });

  const result = await saveCollectedPagePackages({
    signal: activeSignal,
    jobId: 'job-1',
    packages: [collected(0, 7)],
  });

  expect(result.failures[0]?.error).toContain('too large');
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.begin).not.toHaveBeenCalled();
});

it('rejects missing session authority before consuming staged bytes', async () => {
  const source = collected(0, 7);
  const { snapshotSessionId: _omitted, ...descriptor } = source.descriptor;
  const item = { ...source, descriptor };

  const result = await saveCollectedPagePackages({
    signal: activeSignal,
    jobId: 'job-1',
    packages: [item],
  });

  expect(result.failures[0]?.error).toContain('session is missing');
  expect(mocks.consume).not.toHaveBeenCalled();
});
