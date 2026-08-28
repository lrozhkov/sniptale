import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  cleanupOutput: vi.fn(),
  cleanupFailed: vi.fn(),
  confirm: vi.fn(),
  consume: vi.fn(),
  createLease: vi.fn(),
  execute: vi.fn(),
  find: vi.fn(),
  createSink: vi.fn(),
  discard: vi.fn(),
  open: vi.fn(),
  outputAbort: vi.fn(),
  outputAppend: vi.fn(),
  outputFinalize: vi.fn(),
  recordLease: vi.fn(),
  recordPrepared: vi.fn(),
  recordStarting: vi.fn(),
  recordStarted: vi.fn(),
  readFile: vi.fn(),
  readRecovery: vi.fn(),
  recordAmbiguous: vi.fn(),
  remember: vi.fn(),
  plan: vi.fn(),
  releaseLease: vi.fn(),
  writeCollection: vi.fn(),
}));

vi.mock('./stage-route', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./stage-route')>()),
  pagePackageJobStaging: { consume: mocks.consume, releaseJob: vi.fn() },
}));
vi.mock('./page-boundary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./page-boundary')>()),
  openStagedPagePackage: mocks.open,
}));
vi.mock('./offscreen-download-gateway', () => ({
  createPagePackageDownloadOffscreenGateway: () => ({
    confirm: mocks.confirm,
    create: mocks.createLease,
    release: mocks.releaseLease,
  }),
}));
vi.mock('./storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./storage')>()),
  cleanupRecordedPagePackageOutput: mocks.cleanupOutput,
  readPagePackageJobRecoveryState: mocks.readRecovery,
  recordPagePackageOutputAmbiguous: mocks.recordAmbiguous,
  recordPagePackageOutputCleanupFailed: mocks.cleanupFailed,
  recordPopupExportDownloadLease: mocks.recordLease,
  recordPopupExportDownloadPrepared: mocks.recordPrepared,
  recordPopupExportDownloadStarting: mocks.recordStarting,
  recordPopupExportDownloadStarted: mocks.recordStarted,
}));
vi.mock('../../download/download-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../download/download-router')>()),
  defaultDownloadRouterService: {
    cancelDownloadAndWait: mocks.cancel,
    findDownloadsByExactUrl: mocks.find,
    rememberPendingDownload: mocks.remember,
  },
  executeDownloadUrl: mocks.execute,
}));
vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: vi.fn(async () => ({ defaultExportPresetId: null })),
}));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  createPreparedAssetArchiveSink: mocks.createSink,
  createAssetObjectWriter: vi.fn(async () => ({
    abort: mocks.outputAbort,
    append: mocks.outputAppend,
    assetId: 'output-asset',
    finalize: mocks.outputFinalize,
  })),
  discardPreparedAsset: mocks.discard,
  readAssetFile: mocks.readFile,
}));
vi.mock('../../../../workflows/page-package/collection/manifest', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../workflows/page-package/collection/manifest')
  >()),
  planPageCollection: mocks.plan,
}));
vi.mock('../../../../workflows/page-package/collection/archive', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../workflows/page-package/collection/archive')
  >()),
  writePageCollectionArchive: mocks.writeCollection,
}));

import { downloadCollectedPagePackages, releaseCollectedPagePackages } from './download';
import { reconcileAndCleanupPagePackageOutput } from './download-effect';

const reference = {
  assetId: 'asset-1',
  createdAt: 1,
  location: { kind: 'opfs' as const, objectKey: 'objects/asset-1' },
  mimeType: 'application/x-sniptale-page-package+zip',
  sha256: 'a'.repeat(64),
  size: 100,
};
const outputReference = {
  ...reference,
  assetId: 'output-asset',
  location: { kind: 'opfs' as const, objectKey: 'objects/output-asset' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue({
    file: new File(['archive'], 'page.zip'),
    prepared: { ref: reference },
  });
  mocks.open.mockResolvedValue({
    pagePackage: {
      entries: [
        {
          component: 'page-data',
          mediaType: 'application/json',
          path: 'page/data.json',
          sha256: 'c'.repeat(64),
          size: 2,
          source: {
            compressedSize: 2,
            crc32: 1,
            directory: false,
            path: 'page/data.json',
            pipeTo: vi.fn(),
            size: 2,
            text: vi.fn(),
          },
        },
      ],
      manifest: {
        entries: [
          {
            component: 'pageData',
            mimeType: 'application/json',
            path: 'page/data.json',
            sha256: 'c'.repeat(64),
            size: 2,
          },
        ],
        id: 'page-1',
        source: { title: 'Page' },
        stats: { totalBytes: 0 },
      },
      manifestBytes: new Uint8Array(),
      manifestSha256: 'b'.repeat(64),
      manifestText: '{}',
    },
    reader: { close: vi.fn() },
  });
  mocks.createLease.mockResolvedValue({ leaseId: 'lease-1', url: 'blob:page' });
  mocks.confirm.mockResolvedValue(true);
  mocks.releaseLease.mockResolvedValue(true);
  mocks.execute.mockImplementation(async ({ onTerminal }) => {
    queueMicrotask(() => onTerminal('complete'));
    return 42;
  });
  mocks.recordPrepared.mockResolvedValue(undefined);
  mocks.recordLease.mockResolvedValue(undefined);
  mocks.recordStarting.mockResolvedValue(undefined);
  mocks.recordStarted.mockResolvedValue(undefined);
  mocks.cleanupOutput.mockResolvedValue(undefined);
  mocks.cleanupFailed.mockResolvedValue(undefined);
  mocks.recordAmbiguous.mockResolvedValue(undefined);
  mocks.remember.mockResolvedValue(undefined);
  mocks.readFile.mockResolvedValue(
    new File(['archive'], 'page.zip', { type: 'application/x-sniptale-page-package+zip' })
  );
  mocks.find.mockResolvedValue([{ downloadId: 42, state: 'complete' }]);
  mocks.outputAbort.mockResolvedValue(undefined);
  mocks.outputAppend.mockResolvedValue(undefined);
  mocks.outputFinalize.mockResolvedValue({ ref: outputReference });
  mocks.readRecovery.mockImplementation(async () => ({
    jobId: 'job-1',
    output: {
      assetJournalId: 'journal-1',
      assetRef: outputReference,
      cleanupError: null,
      downloadId: 42,
      downloadOperationId: mocks.recordPrepared.mock.calls[0]?.[0]?.operationId ?? 'operation-1',
      downloadRequestedAt: 1,
      filename: 'page.zip',
      journalVerified: true,
      kind: 'page-package',
      leaseUrl: 'blob:page',
      phase: 'downloading',
      urlLeaseId: 'lease-1',
    },
    stagedPages: [],
  }));
  mocks.cancel.mockResolvedValue('interrupted');
  mocks.discard.mockResolvedValue(undefined);
  mocks.plan.mockImplementation((value) => ({
    ...value,
    manifest: {},
    pages: value.successfulPages,
  }));
  mocks.createSink.mockResolvedValue({
    preparedAsset: () => ({
      ref: { ...reference, assetId: 'collection-asset', mimeType: 'application/zip' },
    }),
    sink: {},
  });
  mocks.writeCollection.mockImplementation(async ({ plan, resolvePagePackage }) => {
    for (const page of plan.pages) {
      const opened = await resolvePagePackage(page);
      await opened.release();
    }
  });
});

function singlePageArgs(signal = new AbortController().signal) {
  return {
    errors: [],
    failedPages: [],
    jobId: 'job-1',
    packages: [
      {
        descriptor: {
          jobId: 'job-1',
          manifestSha256: 'b'.repeat(64),
          manifestSize: 2,
          ordinal: 0,
          pageId: 'page-1',
          producerStats: { filesCount: 3, filesFailed: 1, rowsCount: 5, sectionsCount: 2 },
          stagedBlobId: 'stage-1',
          title: 'Page',
          totalBytes: 2,
        },
        tab: { tabId: 7, title: 'Page' },
      },
    ],
    requestedPageCount: 1,
    signal,
    warnings: [],
  };
}

it('persists pre-effect, lease and browser identities before awaiting terminal success', async () => {
  const signal = new AbortController().signal;
  const result = await downloadCollectedPagePackages(singlePageArgs(signal));

  expect(result.pageCount).toBe(1);
  expect(mocks.open).toHaveBeenCalledWith(expect.any(File), expect.any(Object), signal);
  expect(mocks.outputAppend).toHaveBeenCalledWith(expect.any(File));
  expect(mocks.recordPrepared).toHaveBeenCalledWith(
    expect.objectContaining({ reference: outputReference })
  );
  expect(mocks.recordPrepared.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.createLease.mock.invocationCallOrder[0]!
  );
  expect(mocks.recordLease.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.recordStarting.mock.invocationCallOrder[0]!
  );
  expect(mocks.recordStarting.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.execute.mock.invocationCallOrder[0]!
  );
  expect(mocks.recordStarted).toHaveBeenCalledWith({
    downloadId: 42,
    jobId: 'job-1',
    operationId: expect.any(String),
  });
  expect(mocks.confirm).toHaveBeenCalledOnce();
  expect(mocks.releaseLease).toHaveBeenCalledOnce();
  expect(mocks.cleanupOutput).toHaveBeenCalledOnce();
});

it('cancels the browser item and still releases the durable lease when aborted', async () => {
  const controller = new AbortController();
  mocks.execute.mockResolvedValueOnce(42);
  const download = downloadCollectedPagePackages(singlePageArgs(controller.signal));
  await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce());
  controller.abort();

  await expect(download).rejects.toThrow('could not be completed safely');

  expect(mocks.cancel).toHaveBeenCalledWith(42);
  expect(mocks.releaseLease).toHaveBeenCalledOnce();
  expect(mocks.cleanupOutput).toHaveBeenCalledOnce();
});

it('surfaces cleanup failure after a successful terminal browser download', async () => {
  mocks.releaseLease.mockRejectedValueOnce(new Error('lease cleanup failed'));

  await expect(downloadCollectedPagePackages(singlePageArgs())).rejects.toThrow(
    'could not be completed safely'
  );

  expect(mocks.cleanupOutput).not.toHaveBeenCalled();
  expect(mocks.cleanupFailed).toHaveBeenCalledWith(
    expect.objectContaining({ error: 'lease cleanup failed', jobId: 'job-1' })
  );
});

it('retains cleanup authority when offscreen does not confirm lease release', async () => {
  mocks.releaseLease.mockResolvedValueOnce(false);

  await expect(downloadCollectedPagePackages(singlePageArgs())).rejects.toThrow(
    'could not be completed safely'
  );

  expect(mocks.cleanupOutput).not.toHaveBeenCalled();
  expect(mocks.cleanupFailed).toHaveBeenCalledOnce();
});

it('retains zero-match output after browser admission when download-id persistence fails', async () => {
  mocks.recordStarted.mockRejectedValueOnce(new Error('session write failed'));
  mocks.find.mockResolvedValueOnce([]);
  let recoveryRead = 0;
  mocks.readRecovery.mockImplementation(async () => {
    recoveryRead += 1;
    const operationId = mocks.recordPrepared.mock.calls[0]?.[0]?.operationId ?? 'operation-1';
    return {
      jobId: 'job-1',
      output: {
        assetJournalId: 'journal-1',
        assetRef: outputReference,
        cleanupError: recoveryRead === 1 ? null : 'ambiguous browser effect',
        downloadId: null,
        downloadOperationId: operationId,
        downloadRequestedAt: 1,
        filename: 'page.zip',
        journalVerified: true,
        kind: 'page-package',
        leaseUrl: 'blob:page',
        phase: recoveryRead === 1 ? 'starting-download' : 'ambiguous-download',
        urlLeaseId: 'lease-1',
      },
      stagedPages: [],
    };
  });

  await expect(downloadCollectedPagePackages(singlePageArgs())).rejects.toThrow(
    'could not be completed safely'
  );

  expect(mocks.recordAmbiguous).toHaveBeenCalledOnce();
  expect(mocks.cancel).not.toHaveBeenCalled();
  expect(mocks.releaseLease).not.toHaveBeenCalled();
  expect(mocks.cleanupOutput).not.toHaveBeenCalled();
  expect(mocks.cleanupFailed).not.toHaveBeenCalled();
});

it('rebinds an in-progress browser match after restart without cancelling it', async () => {
  const startingOutput = {
    assetJournalId: 'journal-1',
    assetRef: reference,
    cleanupError: null,
    downloadId: null,
    downloadOperationId: 'operation-1',
    downloadRequestedAt: 500,
    filename: 'page.zip',
    journalVerified: true,
    kind: 'page-package',
    leaseUrl: 'blob:page',
    phase: 'starting-download',
    urlLeaseId: 'lease-1',
  };
  mocks.readRecovery.mockResolvedValue({
    jobId: 'job-1',
    output: startingOutput,
    stagedPages: [],
  });
  mocks.find.mockResolvedValueOnce([{ downloadId: 73, state: 'in_progress' }]);

  await reconcileAndCleanupPagePackageOutput('job-1');

  expect(mocks.find).toHaveBeenCalledWith({ requestedAt: 500, url: 'blob:page' });
  expect(mocks.recordStarted).toHaveBeenCalledWith({
    downloadId: 73,
    jobId: 'job-1',
    operationId: 'operation-1',
  });
  expect(mocks.remember).toHaveBeenCalledWith(73, expect.any(Function), 'generic', undefined, true);
  expect(mocks.cancel).not.toHaveBeenCalled();
  expect(mocks.releaseLease).not.toHaveBeenCalled();
  expect(mocks.cleanupOutput).not.toHaveBeenCalled();

  mocks.readRecovery.mockResolvedValue({
    jobId: 'job-1',
    output: { ...startingOutput, downloadId: 73, phase: 'downloading' },
    stagedPages: [],
  });
  mocks.find.mockResolvedValueOnce([{ downloadId: 73, state: 'complete' }]);
  const terminalHandler = mocks.remember.mock.calls[0]![1] as (state: string) => void;
  terminalHandler('complete');
  await vi.waitFor(() => expect(mocks.cleanupOutput).toHaveBeenCalledOnce());
  expect(mocks.releaseLease).toHaveBeenCalledOnce();
});

it('retries durable retirement after the exact lease was already released', async () => {
  mocks.cleanupOutput.mockRejectedValueOnce(new Error('session write failed'));

  await expect(reconcileAndCleanupPagePackageOutput('job-1')).rejects.toThrow(
    'session write failed'
  );
  await expect(reconcileAndCleanupPagePackageOutput('job-1')).resolves.toBeUndefined();

  expect(mocks.releaseLease).toHaveBeenCalledTimes(2);
  expect(mocks.cleanupOutput).toHaveBeenCalledTimes(2);
});

it('cancels an exact in-progress browser match only for an explicit cleanup intent', async () => {
  mocks.find.mockResolvedValueOnce([{ downloadId: 42, state: 'in_progress' }]);

  await reconcileAndCleanupPagePackageOutput('job-1', { cancelActiveDownload: true });

  expect(mocks.cancel).toHaveBeenCalledWith(42);
  expect(mocks.releaseLease).toHaveBeenCalledOnce();
  expect(mocks.cleanupOutput).toHaveBeenCalledOnce();
  expect(mocks.remember).not.toHaveBeenCalled();
});

it('retains the lease and source when exact browser admission is ambiguous', async () => {
  const startingOutput = {
    assetJournalId: 'journal-1',
    assetRef: reference,
    cleanupError: null,
    downloadId: null,
    downloadOperationId: 'operation-1',
    downloadRequestedAt: 500,
    filename: 'page.zip',
    journalVerified: true,
    kind: 'page-package',
    leaseUrl: 'blob:page',
    phase: 'starting-download',
    urlLeaseId: 'lease-1',
  };
  mocks.readRecovery.mockReset();
  mocks.readRecovery
    .mockResolvedValueOnce({ jobId: 'job-1', output: startingOutput, stagedPages: [] })
    .mockResolvedValueOnce({
      jobId: 'job-1',
      output: { ...startingOutput, phase: 'ambiguous-download' },
      stagedPages: [],
    });
  mocks.find.mockResolvedValueOnce([]);

  await expect(reconcileAndCleanupPagePackageOutput('job-1')).rejects.toThrow('ambiguous');

  expect(mocks.recordAmbiguous).toHaveBeenCalledOnce();
  expect(mocks.releaseLease).not.toHaveBeenCalled();
  expect(mocks.cleanupOutput).not.toHaveBeenCalled();
  expect(mocks.cleanupFailed).not.toHaveBeenCalled();
});

it('retires a starting download with no browser match only after explicit acknowledgement', async () => {
  const startingOutput = {
    assetJournalId: 'journal-1',
    assetRef: reference,
    cleanupError: null,
    downloadId: null,
    downloadOperationId: 'operation-1',
    downloadRequestedAt: 500,
    filename: 'page.zip',
    journalVerified: true,
    kind: 'page-package',
    leaseUrl: 'blob:page',
    phase: 'ambiguous-download',
    urlLeaseId: 'lease-1',
  };
  mocks.readRecovery.mockResolvedValue({
    jobId: 'job-1',
    output: startingOutput,
    stagedPages: [],
  });
  mocks.find.mockResolvedValueOnce([]);

  await reconcileAndCleanupPagePackageOutput('job-1', {
    allowAbsentDownloadCleanup: true,
  });

  expect(mocks.cancel).not.toHaveBeenCalled();
  expect(mocks.releaseLease).toHaveBeenCalledOnce();
  expect(mocks.cleanupOutput).toHaveBeenCalledOnce();
  expect(mocks.recordAmbiguous).not.toHaveBeenCalled();
});

it('does not treat a missing browser match as absent when a download id was persisted', async () => {
  const downloadingOutput = {
    assetJournalId: 'journal-1',
    assetRef: outputReference,
    cleanupError: null,
    downloadId: 42,
    downloadOperationId: 'operation-1',
    downloadRequestedAt: 500,
    filename: 'page.zip',
    journalVerified: true,
    kind: 'page-package',
    leaseUrl: 'blob:page',
    phase: 'downloading',
    urlLeaseId: 'lease-1',
  };
  mocks.readRecovery.mockReset();
  mocks.readRecovery
    .mockResolvedValueOnce({ jobId: 'job-1', output: downloadingOutput, stagedPages: [] })
    .mockResolvedValueOnce({
      jobId: 'job-1',
      output: { ...downloadingOutput, phase: 'ambiguous-download' },
      stagedPages: [],
    });
  mocks.find.mockResolvedValueOnce([]);

  await expect(
    reconcileAndCleanupPagePackageOutput('job-1', { allowAbsentDownloadCleanup: true })
  ).rejects.toThrow('ambiguous');

  expect(mocks.releaseLease).not.toHaveBeenCalled();
  expect(mocks.cleanupOutput).not.toHaveBeenCalled();
});

it('does not trust a stored download id that differs from the exact URL/time match', async () => {
  const downloadingOutput = {
    assetJournalId: 'journal-1',
    assetRef: outputReference,
    cleanupError: null,
    downloadId: 999,
    downloadOperationId: 'operation-1',
    downloadRequestedAt: 500,
    filename: 'page.zip',
    journalVerified: true,
    kind: 'page-package',
    leaseUrl: 'blob:page',
    phase: 'downloading',
    urlLeaseId: 'lease-1',
  };
  mocks.readRecovery.mockReset();
  mocks.readRecovery
    .mockResolvedValueOnce({ jobId: 'job-1', output: downloadingOutput, stagedPages: [] })
    .mockResolvedValueOnce({
      jobId: 'job-1',
      output: { ...downloadingOutput, phase: 'ambiguous-download' },
      stagedPages: [],
    });
  mocks.find.mockResolvedValueOnce([{ downloadId: 42, state: 'in_progress' }]);

  await expect(reconcileAndCleanupPagePackageOutput('job-1')).rejects.toThrow('ambiguous');

  expect(mocks.cancel).not.toHaveBeenCalled();
  expect(mocks.releaseLease).not.toHaveBeenCalled();
  expect(mocks.cleanupOutput).not.toHaveBeenCalled();
  expect(mocks.recordAmbiguous).toHaveBeenCalledOnce();
});

it('plans a partial collection and resolves only one staged reader at a time', async () => {
  const single = singlePageArgs();
  const args = {
    ...single,
    errors: ['Middle page failed'],
    failedPages: [{ message: 'Middle page failed', ordinal: 2, title: null }],
    packages: [
      ...single.packages,
      {
        descriptor: {
          ...single.packages[0]!.descriptor,
          ordinal: 2,
          pageId: 'page-3',
          stagedBlobId: 'stage-3',
          title: 'Page 3',
        },
        tab: { tabId: 9, title: 'Page 3' },
      },
    ],
    requestedPageCount: 3,
  };

  const result = await downloadCollectedPagePackages(args);

  expect(result).toEqual({ filename: expect.stringContaining('page-collection_'), pageCount: 2 });
  expect(mocks.plan).toHaveBeenCalledWith(
    expect.objectContaining({
      failedPages: [expect.objectContaining({ ordinal: 2 })],
      successfulPages: [
        expect.objectContaining({ ordinal: 1 }),
        expect.objectContaining({ ordinal: 3 }),
      ],
    })
  );
  expect(mocks.open).toHaveBeenCalledTimes(4);
  expect(mocks.discard).not.toHaveBeenCalledWith('collection-asset');
  const plannedPackage = mocks.plan.mock.calls[0]![0].successfulPages[0].pagePackage;
  expect(plannedPackage).not.toHaveProperty('manifestBytes');
  expect(plannedPackage).not.toHaveProperty('manifestText');
  expect(plannedPackage.entries[0]).not.toHaveProperty('source');
});

it('keeps failure reporting in a collection when only one multi-tab page succeeds', async () => {
  const args = {
    ...singlePageArgs(),
    errors: ['Second page unavailable'],
    failedPages: [{ message: 'Second page unavailable', ordinal: 2, title: 'Second' }],
    requestedPageCount: 2,
  };

  const result = await downloadCollectedPagePackages(args);

  expect(result).toEqual({ filename: expect.stringContaining('page-collection_'), pageCount: 1 });
  expect(mocks.plan).toHaveBeenCalledWith(
    expect.objectContaining({
      failedPages: [expect.objectContaining({ message: 'Second page unavailable', ordinal: 2 })],
      successfulPages: [expect.objectContaining({ ordinal: 1 })],
    })
  );
  expect(mocks.outputAppend).not.toHaveBeenCalled();
});

it('rejects an empty staged collection and delegates job release to staging authority', async () => {
  await expect(
    downloadCollectedPagePackages({ ...singlePageArgs(), packages: [] })
  ).rejects.toThrow('No valid Page Packages');

  await releaseCollectedPagePackages('job-1');
  const { pagePackageJobStaging } = await import('./stage-route');
  expect(pagePackageJobStaging.releaseJob).toHaveBeenCalledWith('job-1');
});
