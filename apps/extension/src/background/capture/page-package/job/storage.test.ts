import { beforeEach, expect, it, vi } from 'vitest';
import type { PagePackageJobStatusV1 } from './status';

const mocks = vi.hoisted(() => ({
  available: vi.fn(() => true),
  createJournal: vi.fn(),
  deleteJournal: vi.fn(),
  discard: vi.fn(),
  ensureLocaleHydrated: vi.fn(),
  getCurrentLocale: vi.fn(() => 'ru' as const),
  journals: [] as unknown[],
  setStorage: vi.fn(),
  state: {} as Record<string, unknown>,
  translate: vi.fn((key: string, locale?: string) => `${key}:${locale ?? 'current'}`),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  ensureLocaleHydrated: mocks.ensureLocaleHydrated,
  getCurrentLocale: mocks.getCurrentLocale,
  translate: mocks.translate,
}));

vi.mock('../../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    session: {
      get: vi.fn(async () => ({ ...mocks.state })),
      isAvailable: mocks.available,
      remove: vi.fn(async (key: string) => {
        delete mocks.state[key];
      }),
      set: mocks.setStorage,
    },
  },
}));

vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  createAssetPublicationJournal: mocks.createJournal,
  deleteReadyJournal: mocks.deleteJournal,
  discardPreparedAsset: mocks.discard,
  listReadyJournals: vi.fn(async () => mocks.journals),
}));

import {
  PAGE_PACKAGE_JOB_STORAGE_KEY,
  clearPagePackageJobStatus,
  hasUnresolvedPagePackageResources,
  interruptStoredPopupExportJob,
  cleanupRecordedPagePackageOutput,
  readPagePackageJobRecoveryState,
  readPagePackageJobLocale,
  readPagePackageJobStatus,
  recordPagePackageLibraryCleanupAsset,
  recordPopupExportDownloadLease,
  recordPopupExportDownloadPrepared,
  recordPopupExportDownloadStarting,
  recordPopupExportDownloadStarted,
  recordPopupExportStagedPage,
  reconcileUnmatchedPagePackageJobJournals,
  removePopupExportStagedPage,
  writePagePackageJobStatus,
} from './storage';
import { parsePagePackageJobRecordV1 } from './storage-record';

function status(phase: PagePackageJobStatusV1['phase'] = 'running'): PagePackageJobStatusV1 {
  return {
    activatedTabIds: [],
    effectiveOptions: {
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: false,
      includeImages: true,
      includeJson: true,
      includeMarkdown: true,
      includePageDiagnostics: false,
    },
    effectiveComponentPlan: {
      components: {
        attachments: true,
        diagnostics: false,
        images: true,
        pageData: true,
        webCopy: false,
      },
      diagnosticsLevel: 'none',
      includeScreenshot: false,
    },
    jobId: 'job-1',
    intent: 'export',
    orderedTabs: [{ tabId: 7, title: 'Page' }],
    pageOutcomes: [{ ordinal: 0, status: 'pending', tabId: 7 }],
    originalActiveTabs: [],
    phase,
    progress: { current: 0, errors: [], message: 'Running', phase: 'scanning', total: 1 },
    revision: 1,
    warnings: [],
  };
}

const ref = {
  assetId: 'asset-1',
  createdAt: 1,
  location: { kind: 'opfs' as const, objectKey: 'objects/asset-1' },
  mimeType: 'application/x-sniptale-page-package+zip',
  sha256: 'a'.repeat(64),
  size: 10,
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(mocks.state)) delete mocks.state[key];
  mocks.journals.length = 0;
  mocks.available.mockReturnValue(true);
  mocks.createJournal.mockResolvedValue({ journalId: 'journal-1' });
  mocks.deleteJournal.mockResolvedValue(undefined);
  mocks.discard.mockResolvedValue(undefined);
  mocks.ensureLocaleHydrated.mockResolvedValue(undefined);
  mocks.setStorage.mockImplementation(async (value: Record<string, unknown>) => {
    Object.assign(mocks.state, value);
  });
});

it('hydrates locale before publishing an interrupted-job message', async () => {
  await writePagePackageJobStatus(status());
  let finishHydration!: () => void;
  mocks.ensureLocaleHydrated.mockImplementationOnce(
    () => new Promise<void>((resolve) => (finishHydration = resolve))
  );

  const interruption = interruptStoredPopupExportJob('job-1');
  await Promise.resolve();
  expect(mocks.setStorage).toHaveBeenCalledTimes(1);
  finishHydration();
  await interruption;
  expect(mocks.setStorage).toHaveBeenCalledTimes(2);
});

it('retains the job locale when recovery runs after the current locale changes', async () => {
  await writePagePackageJobStatus(status(), 'en');

  await interruptStoredPopupExportJob('job-1');

  expect(await readPagePackageJobLocale()).toBe('en');
  expect(await readPagePackageJobStatus()).toMatchObject({
    phase: 'interrupted',
    progress: { message: 'popup.export.jobInterruptedMessage:en' },
  });
});

it('parses persisted locale, migrates a legacy record, and rejects an unknown locale', async () => {
  await writePagePackageJobStatus(status(), 'en');
  const record = structuredClone(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]) as Record<
    string,
    unknown
  >;

  expect(parsePagePackageJobRecordV1(record)).toMatchObject({ locale: 'en' });

  const legacyRecord = { ...record };
  delete legacyRecord['locale'];
  expect(parsePagePackageJobRecordV1(legacyRecord)).toMatchObject({ locale: null });
  expect(parsePagePackageJobRecordV1({ ...record, locale: null })).toMatchObject({ locale: null });
  expect(parsePagePackageJobRecordV1({ ...record, locale: 'fr' })).toBeNull();
});

it('still interrupts a stored job when locale hydration fails', async () => {
  await writePagePackageJobStatus(status());
  mocks.ensureLocaleHydrated.mockRejectedValueOnce(new Error('locale storage unavailable'));

  await expect(interruptStoredPopupExportJob('job-1')).resolves.toBeUndefined();

  expect(await readPagePackageJobStatus()).toMatchObject({
    jobId: 'job-1',
    phase: 'interrupted',
  });
});

it('reconciles staged and output journals left before their session-record writes', async () => {
  const outputRef = {
    ...ref,
    assetId: 'output-asset',
    location: { kind: 'opfs' as const, objectKey: 'objects/output-asset' },
  };
  mocks.journals.push(
    {
      assetRefs: [ref],
      createdAt: 1,
      domain: 'page-package-job-temp',
      journalId: 'journal-staged',
      payload: {
        jobId: 'job-1',
        kind: 'staged-page',
        ordinal: 0,
        stagedBlobId: 'stage-1',
        tabId: 7,
      },
    },
    {
      assetRefs: [outputRef],
      createdAt: 1,
      domain: 'page-package-job-temp',
      journalId: 'journal-output',
      payload: {
        downloadOperationId: 'operation-1',
        filename: 'page-package.zip',
        jobId: 'job-1',
        kind: 'download-output',
      },
    }
  );

  await reconcileUnmatchedPagePackageJobJournals();

  expect(mocks.discard).toHaveBeenCalledWith('asset-1');
  expect(mocks.discard).toHaveBeenCalledWith('output-asset');
  expect(mocks.deleteJournal).toHaveBeenCalledWith('journal-staged');
  expect(mocks.deleteJournal).toHaveBeenCalledWith('journal-output');
});

it('stores one private record and preserves staged refs across public status updates', async () => {
  await writePagePackageJobStatus(status());
  await recordPopupExportStagedPage(
    { jobId: 'job-1', ordinal: 0, stagedBlobId: 'stage-1', tabId: 7 },
    { ref }
  );
  await writePagePackageJobStatus({ ...status(), revision: 2 });

  expect(mocks.createJournal).toHaveBeenCalledWith({
    assetRefs: [ref],
    domain: 'page-package-job-temp',
    payload: {
      jobId: 'job-1',
      kind: 'staged-page',
      ordinal: 0,
      stagedBlobId: 'stage-1',
      tabId: 7,
    },
  });
  expect(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]).toMatchObject({
    jobId: 'job-1',
    status: { intent: 'export', jobId: 'job-1', revision: 2 },
    schemaVersion: 1,
    stagedPages: [{ assetJournalId: 'journal-1', assetRef: ref, stagedBlobId: 'stage-1' }],
  });
  await expect(readPagePackageJobStatus()).resolves.toMatchObject({
    intent: 'export',
    revision: 2,
  });
});

it('does not replace another job while its durable resources remain unresolved', async () => {
  await writePagePackageJobStatus(status());
  await recordPopupExportStagedPage(
    { jobId: 'job-1', ordinal: 0, stagedBlobId: 'stage-1', tabId: 7 },
    { ref }
  );

  await expect(writePagePackageJobStatus({ ...status(), jobId: 'job-2' })).rejects.toThrow(
    'still owns unresolved resources'
  );

  expect(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]).toMatchObject({
    jobId: 'job-1',
    stagedPages: [{ stagedBlobId: 'stage-1' }],
  });
});

it('does not publish completion while the same job still owns staged resources', async () => {
  await writePagePackageJobStatus(status());
  await recordPopupExportStagedPage(
    { jobId: 'job-1', ordinal: 0, stagedBlobId: 'stage-1', tabId: 7 },
    { ref }
  );

  await expect(writePagePackageJobStatus(status('completed'))).rejects.toThrow(
    'cannot retain unresolved resources'
  );

  await expect(readPagePackageJobStatus()).resolves.toMatchObject({ phase: 'running' });
  expect(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]).toMatchObject({
    stagedPages: [{ stagedBlobId: 'stage-1' }],
    status: { phase: 'running' },
  });
});

it('retains exact Library cleanup authority durably until verified deletion clears it', async () => {
  await writePagePackageJobStatus({ ...status(), intent: 'save' });
  await recordPagePackageLibraryCleanupAsset('job-1', 'library-asset-1');

  expect(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]).toMatchObject({
    libraryCleanupAssetIds: ['library-asset-1'],
  });
  await expect(hasUnresolvedPagePackageResources()).resolves.toBe(true);
  const completedSave = {
    ...status('completed'),
    intent: 'save' as const,
    result: {
      errors: [],
      filename: 'Saved',
      kind: 'webSnapshot' as const,
      snapshotBatchSize: 1,
      snapshotIds: ['library-asset-1'],
      stats: { filesCount: 1, filesFailed: 0, rowsCount: 0, sectionsCount: 1 },
      success: true,
      warnings: [],
    },
  };
  await expect(
    writePagePackageJobStatus({
      ...completedSave,
      result: { ...completedSave.result, snapshotIds: ['different-asset'] },
    })
  ).rejects.toThrow('does not match retained Library authority');

  await expect(writePagePackageJobStatus(completedSave)).resolves.toBeUndefined();
  await expect(hasUnresolvedPagePackageResources()).resolves.toBe(false);
  expect(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]).toMatchObject({
    libraryCleanupAssetIds: [],
    status: { phase: 'completed', result: { snapshotIds: ['library-asset-1'] } },
  });
});

it('removes a newly-created staged journal when durable admission fails', async () => {
  await writePagePackageJobStatus(status());
  mocks.setStorage.mockRejectedValueOnce(new Error('session write failed'));

  await expect(
    recordPopupExportStagedPage(
      { jobId: 'job-1', ordinal: 0, stagedBlobId: 'stage-1', tabId: 7 },
      { ref }
    )
  ).rejects.toThrow('session write failed');

  expect(mocks.deleteJournal).toHaveBeenCalledWith('journal-1');
  expect(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]).toMatchObject({ stagedPages: [] });
});

it('retires the durable staged record before removing its unmatched journal', async () => {
  await writePagePackageJobStatus(status());
  const binding = { jobId: 'job-1', ordinal: 0, stagedBlobId: 'stage-1', tabId: 7 };
  await recordPopupExportStagedPage(binding, { ref });
  mocks.journals.push({
    assetRefs: [ref],
    createdAt: 1,
    domain: 'page-package-job-temp',
    journalId: 'journal-1',
    payload: { ...binding, kind: 'staged-page' },
  });
  await removePopupExportStagedPage(binding);

  expect(mocks.discard).toHaveBeenCalledWith('asset-1');
  expect(mocks.deleteJournal).toHaveBeenCalledWith('journal-1');
  expect(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]).toMatchObject({ stagedPages: [] });
});

it('marks unfinished work interrupted and compensates its durable staged refs', async () => {
  await writePagePackageJobStatus(status());
  await recordPopupExportStagedPage(
    { jobId: 'job-1', ordinal: 0, stagedBlobId: 'stage-1', tabId: 7 },
    { ref }
  );
  mocks.journals.push({
    assetRefs: [ref],
    createdAt: 1,
    domain: 'page-package-job-temp',
    journalId: 'journal-1',
    payload: {
      ...{ jobId: 'job-1', ordinal: 0, stagedBlobId: 'stage-1', tabId: 7 },
      kind: 'staged-page',
    },
  });
  await interruptStoredPopupExportJob('job-1');

  await expect(readPagePackageJobStatus()).resolves.toMatchObject({
    phase: 'interrupted',
    revision: 2,
  });
  expect(mocks.deleteJournal).toHaveBeenCalledWith('journal-1');
  expect(mocks.discard).toHaveBeenCalledWith('asset-1');
  expect(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]).toMatchObject({ stagedPages: [] });
});

it('journals a prepared download before effects and clears its protection after reconciliation', async () => {
  mocks.createJournal.mockResolvedValueOnce({ journalId: 'download-journal' });
  await writePagePackageJobStatus(status());

  await recordPopupExportDownloadPrepared({
    filename: 'page-package.zip',
    jobId: 'job-1',
    operationId: 'download-operation-1',
    reference: ref,
  });
  expect(mocks.createJournal).toHaveBeenCalledWith({
    assetRefs: [ref],
    domain: 'page-package-job-temp',
    payload: {
      downloadOperationId: 'download-operation-1',
      filename: 'page-package.zip',
      jobId: 'job-1',
      kind: 'download-output',
    },
  });
  await recordPopupExportDownloadLease({
    jobId: 'job-1',
    leaseId: 'lease-1',
    leaseUrl: 'blob:lease-1',
    operationId: 'download-operation-1',
  });
  await recordPopupExportDownloadStarting({
    jobId: 'job-1',
    operationId: 'download-operation-1',
    requestedAt: 100,
  });
  await recordPopupExportDownloadStarted({
    downloadId: 42,
    jobId: 'job-1',
    operationId: 'download-operation-1',
  });

  await expect(readPagePackageJobRecoveryState()).resolves.toMatchObject({
    output: {
      downloadId: 42,
      assetJournalId: 'download-journal',
      urlLeaseId: 'lease-1',
      downloadOperationId: 'download-operation-1',
      assetRef: ref,
    },
    jobId: 'job-1',
  });

  mocks.journals.push({
    assetRefs: [ref],
    createdAt: 1,
    domain: 'page-package-job-temp',
    journalId: 'download-journal',
    payload: {
      downloadOperationId: 'download-operation-1',
      filename: 'page-package.zip',
      jobId: 'job-1',
      kind: 'download-output',
    },
  });
  await cleanupRecordedPagePackageOutput({
    jobId: 'job-1',
    operationId: 'download-operation-1',
  });
  expect(mocks.deleteJournal).toHaveBeenCalledWith('download-journal');
  await expect(readPagePackageJobRecoveryState()).resolves.toMatchObject({ output: null });
});

it('fails closed when a stored output reference has no exact domain journal evidence', async () => {
  mocks.createJournal.mockResolvedValueOnce({ journalId: 'download-journal' });
  await writePagePackageJobStatus(status());
  await recordPopupExportDownloadPrepared({
    filename: 'page-package.zip',
    jobId: 'job-1',
    operationId: 'operation-1',
    reference: ref,
  });
  mocks.journals.push({
    assetRefs: [ref],
    createdAt: 1,
    domain: 'another-domain',
    journalId: 'download-journal',
    payload: {
      downloadOperationId: 'operation-1',
      filename: 'page-package.zip',
      jobId: 'job-1',
      kind: 'download-output',
    },
  });
  const legacyRecord = mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY] as Record<string, unknown>;
  delete legacyRecord['locale'];

  await expect(
    cleanupRecordedPagePackageOutput({ jobId: 'job-1', operationId: 'operation-1' })
  ).rejects.toThrow('ownership could not be verified');

  expect(mocks.discard).not.toHaveBeenCalled();
  expect(mocks.deleteJournal).not.toHaveBeenCalledWith('download-journal');
  expect(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]).toMatchObject({
    locale: null,
    output: { assetRef: ref, phase: 'cleanup-failed' },
  });
  await expect(readPagePackageJobRecoveryState()).resolves.toMatchObject({
    locale: null,
    output: { assetRef: ref, phase: 'cleanup-failed' },
  });
});

it('compensates an unowned output when its ready journal cannot be created', async () => {
  await writePagePackageJobStatus(status());
  mocks.createJournal.mockRejectedValueOnce(new Error('journal unavailable'));

  await expect(
    recordPopupExportDownloadPrepared({
      filename: 'page-package.zip',
      jobId: 'job-1',
      operationId: 'operation-1',
      reference: ref,
    })
  ).rejects.toThrow('journal unavailable');

  expect(mocks.discard).toHaveBeenCalledWith('asset-1');
  expect(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]).toMatchObject({ output: null });
});

it('fails pre-effect persistence when durable session storage is unavailable', async () => {
  mocks.available.mockReturnValue(false);

  await expect(writePagePackageJobStatus(status())).rejects.toThrow(
    'durable session storage is unavailable'
  );

  expect(mocks.setStorage).not.toHaveBeenCalled();
});

it.each([
  ['negative creation time', (value: typeof ref) => ({ ...value, createdAt: -1 })],
  [
    'oversized identifier',
    (value: typeof ref) => {
      const assetId = 'a'.repeat(513);
      return {
        ...value,
        assetId,
        location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
      };
    },
  ],
  ['unsupported MIME', (value: typeof ref) => ({ ...value, mimeType: 'application/octet-stream' })],
  ['non-canonical digest', (value: typeof ref) => ({ ...value, sha256: 'A'.repeat(64) })],
  ['zero byte object', (value: typeof ref) => ({ ...value, size: 0 })],
  ['oversized object', (value: typeof ref) => ({ ...value, size: Number.MAX_SAFE_INTEGER })],
])('rejects a persisted AssetRef with %s', async (_label, mutateRef) => {
  await writePagePackageJobStatus(status());
  await recordPopupExportStagedPage(
    { jobId: 'job-1', ordinal: 0, stagedBlobId: 'stage-1', tabId: 7 },
    { ref }
  );
  const stored = structuredClone(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]) as {
    stagedPages: Array<{ assetRef: typeof ref }>;
  };
  stored.stagedPages[0]!.assetRef = mutateRef(stored.stagedPages[0]!.assetRef) as typeof ref;
  mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY] = stored;

  await expect(readPagePackageJobRecoveryState()).resolves.toBeNull();
  expect(mocks.discard).not.toHaveBeenCalled();
});

it('keeps output journal evidence when durable record retirement fails', async () => {
  mocks.createJournal.mockResolvedValueOnce({ journalId: 'download-journal' });
  await writePagePackageJobStatus(status());
  await recordPopupExportDownloadPrepared({
    filename: 'page-package.zip',
    jobId: 'job-1',
    operationId: 'operation-1',
    reference: ref,
  });
  mocks.journals.push({
    assetRefs: [ref],
    createdAt: 1,
    domain: 'page-package-job-temp',
    journalId: 'download-journal',
    payload: {
      downloadOperationId: 'operation-1',
      filename: 'page-package.zip',
      jobId: 'job-1',
      kind: 'download-output',
    },
  });
  mocks.setStorage.mockRejectedValueOnce(new Error('session write failed'));

  await expect(
    cleanupRecordedPagePackageOutput({ jobId: 'job-1', operationId: 'operation-1' })
  ).rejects.toThrow('session write failed');

  expect(mocks.discard).toHaveBeenCalledWith('asset-1');
  expect(mocks.deleteJournal).not.toHaveBeenCalledWith('download-journal');
  expect(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]).toMatchObject({
    output: { assetJournalId: 'download-journal', phase: 'cleanup-failed' },
  });
});

it('keeps staged journal evidence when live durable record retirement fails', async () => {
  await writePagePackageJobStatus(status());
  const binding = { jobId: 'job-1', ordinal: 0, stagedBlobId: 'stage-1', tabId: 7 };
  await recordPopupExportStagedPage(binding, { ref });
  mocks.journals.push({
    assetRefs: [ref],
    createdAt: 1,
    domain: 'page-package-job-temp',
    journalId: 'journal-1',
    payload: { ...binding, kind: 'staged-page' },
  });
  mocks.setStorage.mockRejectedValueOnce(new Error('session write failed'));

  await expect(removePopupExportStagedPage(binding)).rejects.toThrow('session write failed');

  expect(mocks.discard).toHaveBeenCalledWith('asset-1');
  expect(mocks.deleteJournal).not.toHaveBeenCalledWith('journal-1');
  expect(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]).toMatchObject({
    stagedPages: [{ assetJournalId: 'journal-1' }],
  });
});

it('fails closed if staged and output records claim the same asset', async () => {
  await writePagePackageJobStatus(status());
  await recordPopupExportStagedPage(
    { jobId: 'job-1', ordinal: 0, stagedBlobId: 'stage-1', tabId: 7 },
    { ref }
  );
  mocks.createJournal.mockResolvedValueOnce({ journalId: 'download-journal' });
  await recordPopupExportDownloadPrepared({
    filename: 'page-package.zip',
    jobId: 'job-1',
    operationId: 'operation-1',
    reference: ref,
  });
  mocks.journals.push(
    {
      assetRefs: [ref],
      createdAt: 1,
      domain: 'page-package-job-temp',
      journalId: 'journal-1',
      payload: {
        jobId: 'job-1',
        kind: 'staged-page',
        ordinal: 0,
        stagedBlobId: 'stage-1',
        tabId: 7,
      },
    },
    {
      assetRefs: [ref],
      createdAt: 1,
      domain: 'page-package-job-temp',
      journalId: 'download-journal',
      payload: {
        downloadOperationId: 'operation-1',
        filename: 'page-package.zip',
        jobId: 'job-1',
        kind: 'download-output',
      },
    }
  );

  await expect(
    cleanupRecordedPagePackageOutput({ jobId: 'job-1', operationId: 'operation-1' })
  ).rejects.toThrow('conflicting staged ownership');
  expect(mocks.discard).not.toHaveBeenCalled();
  expect(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]).toMatchObject({
    output: { phase: 'cleanup-failed' },
    stagedPages: [{ phase: 'ready' }],
  });
});

it('retains staged cleanup authority when physical deletion fails', async () => {
  await writePagePackageJobStatus(status());
  await recordPopupExportStagedPage(
    { jobId: 'job-1', ordinal: 0, stagedBlobId: 'stage-1', tabId: 7 },
    { ref }
  );
  mocks.journals.push({
    assetRefs: [ref],
    createdAt: 1,
    domain: 'page-package-job-temp',
    journalId: 'journal-1',
    payload: { jobId: 'job-1', kind: 'staged-page', ordinal: 0, stagedBlobId: 'stage-1', tabId: 7 },
  });
  mocks.discard.mockRejectedValueOnce(new Error('OPFS busy'));

  await expect(interruptStoredPopupExportJob('job-1')).rejects.toThrow('staged cleanup failed');
  expect(mocks.deleteJournal).not.toHaveBeenCalledWith('journal-1');
  expect(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]).toMatchObject({
    stagedPages: [{ assetJournalId: 'journal-1', phase: 'cleanup-failed' }],
  });
});

it('fails closed for a staged reference without exact journal evidence and blocks acknowledgement', async () => {
  await writePagePackageJobStatus(status());
  await recordPopupExportStagedPage(
    { jobId: 'job-1', ordinal: 0, stagedBlobId: 'stage-1', tabId: 7 },
    { ref }
  );
  await writePagePackageJobStatus(status('interrupted'));
  mocks.journals.push({
    assetRefs: [ref],
    createdAt: 1,
    domain: 'wrong-domain',
    journalId: 'journal-1',
    payload: { jobId: 'job-1', kind: 'staged-page', ordinal: 0, stagedBlobId: 'stage-1', tabId: 7 },
  });

  await expect(interruptStoredPopupExportJob('job-1')).rejects.toThrow('staged cleanup failed');
  await expect(hasUnresolvedPagePackageResources()).resolves.toBe(true);
  await expect(clearPagePackageJobStatus('job-1')).rejects.toThrow('cleanup is incomplete');
  expect(mocks.discard).not.toHaveBeenCalled();
  expect(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]).toMatchObject({
    stagedPages: [{ phase: 'cleanup-failed' }],
  });
});

it('atomically clears only the expected resource-free job record', async () => {
  await writePagePackageJobStatus(status('completed'));

  await expect(clearPagePackageJobStatus('replacement-job')).resolves.toBe(false);
  await expect(readPagePackageJobStatus()).resolves.toMatchObject({ jobId: 'job-1' });
  await expect(clearPagePackageJobStatus('job-1')).resolves.toBe(true);
  await expect(readPagePackageJobStatus()).resolves.toBeNull();
});

it('rejects a completed status that still claims unresolved staged resources', async () => {
  await writePagePackageJobStatus(status());
  await recordPopupExportStagedPage(
    { jobId: 'job-1', ordinal: 0, stagedBlobId: 'stage-1', tabId: 7 },
    { ref }
  );
  const stored = structuredClone(mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY]) as {
    status: ReturnType<typeof status>;
  };
  stored.status = status('completed');
  mocks.state[PAGE_PACKAGE_JOB_STORAGE_KEY] = stored;

  await expect(readPagePackageJobRecoveryState()).resolves.toBeNull();
  expect(mocks.discard).not.toHaveBeenCalled();
});
