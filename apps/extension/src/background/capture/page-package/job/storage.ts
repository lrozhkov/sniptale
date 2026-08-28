import type {
  AssetReadyJournal,
  AssetRef,
  PreparedAssetObject,
} from '../../../../composition/persistence/assets';
import {
  createAssetPublicationJournal,
  deleteReadyJournal,
  discardPreparedAsset,
  listReadyJournals,
} from '../../../../composition/persistence/assets';
import { browserStorage } from '../../../../composition/persistence/infrastructure/browser-storage';
import { translate } from '../../../../platform/i18n';
import {
  MAX_POPUP_EXPORT_JOB_TABS,
  isCanonicalPopupExportJobId,
} from '@sniptale/runtime-contracts/export';
import { parsePagePackageJobStatusV1, type PagePackageJobStatusV1 } from './status';
import {
  boundPagePackageCleanupError,
  parsePagePackageJobRecordV1,
  type PagePackageJobRecordV1,
  type PersistedPagePackageOutput,
  type PersistedStagedPage,
} from './storage-record';

export type { PersistedPagePackageOutput } from './storage-record';

export const PAGE_PACKAGE_JOB_STORAGE_KEY = 'sniptale_page_package_job';
const PAGE_PACKAGE_JOB_JOURNAL_DOMAIN = 'page-package-job-temp';

interface PagePackageJobRecoveryState {
  jobId: string;
  libraryCleanupAssetIds: string[];
  output: (PersistedPagePackageOutput & { journalVerified: boolean }) | null;
  stagedPages: Array<PersistedStagedPage & { journalVerified: boolean }>;
  status: PagePackageJobStatusV1;
}

// policyStateId: popup-export-jobs
let mutationQueue = Promise.resolve();

async function readRecordUnlocked(): Promise<PagePackageJobRecordV1 | null> {
  if (!browserStorage.session.isAvailable()) return null;
  const stored = await browserStorage.session.get([PAGE_PACKAGE_JOB_STORAGE_KEY]);
  return parsePagePackageJobRecordV1(stored[PAGE_PACKAGE_JOB_STORAGE_KEY]);
}

function mutateRecord(
  mutation: (record: PagePackageJobRecordV1 | null) => PagePackageJobRecordV1 | null
): Promise<void> {
  const operation = mutationQueue.then(async () => {
    if (!browserStorage.session.isAvailable()) {
      throw new Error('Page Package durable session storage is unavailable.');
    }
    const next = mutation(await readRecordUnlocked());
    if (next)
      await browserStorage.session.set({
        [PAGE_PACKAGE_JOB_STORAGE_KEY]: { ...next, updatedAt: Date.now() },
      });
    else await browserStorage.session.remove(PAGE_PACKAGE_JOB_STORAGE_KEY);
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

function sameAssetRef(left: AssetRef, right: AssetRef): boolean {
  return (
    left.assetId === right.assetId &&
    left.createdAt === right.createdAt &&
    left.location.kind === right.location.kind &&
    left.location.objectKey === right.location.objectKey &&
    left.mimeType === right.mimeType &&
    left.sha256 === right.sha256 &&
    left.size === right.size
  );
}

function hasExactPayload(journal: AssetReadyJournal, payload: Record<string, unknown>): boolean {
  if (!journal.payload || typeof journal.payload !== 'object' || Array.isArray(journal.payload))
    return false;
  const candidate = journal.payload as Record<string, unknown>;
  return (
    Object.keys(candidate).length === Object.keys(payload).length &&
    Object.entries(payload).every(([key, value]) => candidate[key] === value)
  );
}

function journalMatchesStagedPage(journal: AssetReadyJournal, page: PersistedStagedPage): boolean {
  return (
    journal.domain === PAGE_PACKAGE_JOB_JOURNAL_DOMAIN &&
    journal.journalId === page.assetJournalId &&
    journal.operationId === undefined &&
    journal.assetRefs.length === 1 &&
    sameAssetRef(journal.assetRefs[0]!, page.assetRef) &&
    hasExactPayload(journal, {
      jobId: page.jobId,
      kind: 'staged-page',
      ordinal: page.ordinal,
      stagedBlobId: page.stagedBlobId,
      tabId: page.tabId,
    })
  );
}

function journalMatchesOutput(
  journal: AssetReadyJournal,
  jobId: string,
  output: PersistedPagePackageOutput
): boolean {
  return (
    journal.domain === PAGE_PACKAGE_JOB_JOURNAL_DOMAIN &&
    journal.journalId === output.assetJournalId &&
    journal.operationId === undefined &&
    journal.assetRefs.length === 1 &&
    sameAssetRef(journal.assetRefs[0]!, output.assetRef) &&
    hasExactPayload(journal, {
      downloadOperationId: output.downloadOperationId,
      filename: output.filename,
      jobId,
      kind: 'download-output',
    })
  );
}

function isValidUnmatchedJobJournal(journal: AssetReadyJournal): boolean {
  if (
    journal.domain !== PAGE_PACKAGE_JOB_JOURNAL_DOMAIN ||
    journal.operationId !== undefined ||
    journal.assetRefs.length !== 1 ||
    !journal.payload ||
    typeof journal.payload !== 'object' ||
    Array.isArray(journal.payload)
  ) {
    return false;
  }
  const payload = journal.payload as Record<string, unknown>;
  if (!isCanonicalPopupExportJobId(payload['jobId'])) return false;
  if (payload['kind'] === 'staged-page') {
    return (
      Object.keys(payload).length === 5 &&
      Number.isSafeInteger(payload['ordinal']) &&
      (payload['ordinal'] as number) >= 0 &&
      typeof payload['stagedBlobId'] === 'string' &&
      /^[A-Za-z0-9_-]{1,128}$/.test(payload['stagedBlobId']) &&
      Number.isSafeInteger(payload['tabId']) &&
      (payload['tabId'] as number) >= 0
    );
  }
  return (
    payload['kind'] === 'download-output' &&
    Object.keys(payload).length === 4 &&
    typeof payload['downloadOperationId'] === 'string' &&
    /^[A-Za-z0-9_-]{1,128}$/.test(payload['downloadOperationId']) &&
    typeof payload['filename'] === 'string' &&
    payload['filename'].length > 0 &&
    payload['filename'].length <= 1024
  );
}

export async function reconcileUnmatchedPagePackageJobJournals(): Promise<void> {
  await mutationQueue;
  const record = await readRecordUnlocked();
  const journals = (await listReadyJournals()).filter(
    (journal) => journal.domain === PAGE_PACKAGE_JOB_JOURNAL_DOMAIN
  );
  const matchedJournalIds = new Set<string>();
  if (record) {
    for (const journal of journals) {
      if (
        (record.output && journalMatchesOutput(journal, record.status.jobId, record.output)) ||
        record.stagedPages.some((page) => journalMatchesStagedPage(journal, page))
      ) {
        matchedJournalIds.add(journal.journalId);
      }
    }
  }
  const referencedAssetIds = new Set([
    ...(record?.stagedPages.map((page) => page.assetRef.assetId) ?? []),
    ...(record?.output ? [record.output.assetRef.assetId] : []),
  ]);
  const failures: unknown[] = [];
  for (const journal of journals) {
    if (matchedJournalIds.has(journal.journalId)) continue;
    const reference = journal.assetRefs[0];
    if (!isValidUnmatchedJobJournal(journal) || !reference) {
      failures.push(new Error('Unmatched Page Package journal is invalid.'));
      continue;
    }
    if (referencedAssetIds.has(reference.assetId)) {
      failures.push(new Error('Unmatched Page Package journal conflicts with retained ownership.'));
      continue;
    }
    try {
      await discardPreparedAsset(reference.assetId);
      await deleteReadyJournal(journal.journalId);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Unmatched Page Package journal cleanup is incomplete.');
  }
}

export async function readPagePackageJobStatus(): Promise<PagePackageJobStatusV1 | null> {
  await mutationQueue;
  return structuredClone((await readRecordUnlocked())?.status ?? null);
}

export async function readPagePackageJobRecoveryState(): Promise<PagePackageJobRecoveryState | null> {
  await mutationQueue;
  const record = await readRecordUnlocked();
  if (!record) return null;
  const journals = await listReadyJournals();
  return {
    jobId: record.status.jobId,
    libraryCleanupAssetIds: [...record.libraryCleanupAssetIds],
    output: record.output
      ? {
          ...structuredClone(record.output),
          journalVerified: journals.some((journal) =>
            journalMatchesOutput(journal, record.status.jobId, record.output!)
          ),
        }
      : null,
    stagedPages: record.stagedPages.map((page) => ({
      ...structuredClone(page),
      journalVerified: journals.some((journal) => journalMatchesStagedPage(journal, page)),
    })),
    status: structuredClone(record.status),
  };
}

export function writePagePackageJobStatus(status: PagePackageJobStatusV1): Promise<void> {
  const parsedStatus = parsePagePackageJobStatusV1(status);
  if (!parsedStatus) return Promise.reject(new Error('Page Package private status is invalid.'));
  return mutateRecord((record) => {
    const replacesUnresolvedJob =
      record !== null &&
      record.status.jobId !== parsedStatus.jobId &&
      (record.libraryCleanupAssetIds.length > 0 ||
        record.output !== null ||
        record.stagedPages.length > 0);
    if (replacesUnresolvedJob) {
      throw new Error('Another Page Package job still owns unresolved resources.');
    }
    const sameJobRecord = record?.status.jobId === parsedStatus.jobId ? record : null;
    let libraryCleanupAssetIds = sameJobRecord?.libraryCleanupAssetIds ?? [];
    if (parsedStatus.phase === 'completed' && sameJobRecord) {
      if (sameJobRecord.output !== null || sameJobRecord.stagedPages.length > 0) {
        throw new Error('A completed Page Package job cannot retain unresolved resources.');
      }
      if (parsedStatus.intent === 'save') {
        const completedIds = parsedStatus.result?.snapshotIds ?? [];
        if (
          parsedStatus.result?.kind !== 'webSnapshot' ||
          completedIds.length !== libraryCleanupAssetIds.length ||
          completedIds.some((assetId, index) => assetId !== libraryCleanupAssetIds[index])
        ) {
          throw new Error('Completed Save result does not match retained Library authority.');
        }
        libraryCleanupAssetIds = [];
      } else if (libraryCleanupAssetIds.length > 0) {
        throw new Error('A completed Page Package job cannot retain unresolved resources.');
      }
    }
    return {
      jobId: parsedStatus.jobId,
      libraryCleanupAssetIds,
      output: sameJobRecord?.output ?? null,
      schemaVersion: 1,
      stagedPages: sameJobRecord?.stagedPages ?? [],
      status: parsedStatus,
      updatedAt: Date.now(),
    };
  });
}

export function recordPagePackageLibraryCleanupAsset(
  jobId: string,
  assetId: string
): Promise<void> {
  if (!assetId || assetId.length > 512) {
    return Promise.reject(new Error('Page Package Library cleanup asset ID is invalid.'));
  }
  return mutateRecord((record) => {
    if (
      !record ||
      record.status.jobId !== jobId ||
      record.status.intent !== 'save' ||
      (record.status.phase !== 'running' && record.status.phase !== 'cancelling')
    ) {
      throw new Error('Cannot retain Library cleanup outside its active Save job.');
    }
    if (record.libraryCleanupAssetIds.includes(assetId)) return record;
    if (record.libraryCleanupAssetIds.length >= MAX_POPUP_EXPORT_JOB_TABS) {
      throw new Error('Page Package Library cleanup authority exceeds its bound.');
    }
    return {
      ...record,
      libraryCleanupAssetIds: [...record.libraryCleanupAssetIds, assetId],
    };
  });
}

export function clearPagePackageLibraryCleanupAssets(
  jobId: string,
  assetIds: readonly string[]
): Promise<void> {
  const cleared = new Set(assetIds);
  return mutateRecord((record) =>
    record?.status.jobId === jobId
      ? {
          ...record,
          libraryCleanupAssetIds: record.libraryCleanupAssetIds.filter(
            (assetId) => !cleared.has(assetId)
          ),
        }
      : record
  );
}

export async function recordPopupExportDownloadPrepared(args: {
  filename: string;
  jobId: string;
  operationId: string;
  reference: AssetRef;
}): Promise<void> {
  let journal: AssetReadyJournal | null = null;
  try {
    journal = await createAssetPublicationJournal({
      assetRefs: [args.reference],
      domain: PAGE_PACKAGE_JOB_JOURNAL_DOMAIN,
      payload: {
        downloadOperationId: args.operationId,
        filename: args.filename,
        jobId: args.jobId,
        kind: 'download-output' as const,
      },
    });
    await mutateRecord((record) => {
      if (!record || record.status.jobId !== args.jobId || record.output)
        throw new Error('Cannot prepare a download outside its active Page Package job.');
      return {
        ...record,
        output: {
          assetJournalId: journal!.journalId,
          assetRef: args.reference,
          cleanupError: null,
          downloadId: null,
          downloadOperationId: args.operationId,
          downloadRequestedAt: null,
          filename: args.filename,
          kind: record.status.orderedTabs.length === 1 ? 'page-package' : 'page-collection',
          leaseUrl: null,
          phase: 'prepared',
          urlLeaseId: null,
        },
        stagedPages: record.stagedPages,
      };
    });
  } catch (error) {
    await mutationQueue;
    const record = await readRecordUnlocked();
    let cleanupError: unknown;
    try {
      if (!record?.stagedPages.some((page) => sameAssetRef(page.assetRef, args.reference))) {
        await discardPreparedAsset(args.reference.assetId);
      }
      if (journal) await deleteReadyJournal(journal.journalId);
    } catch (cleanupFailure) {
      cleanupError = cleanupFailure;
    }
    if (cleanupError !== undefined) {
      throw new AggregateError(
        [error, cleanupError],
        'Page Package output admission cleanup failed.',
        { cause: error }
      );
    }
    throw error;
  }
}

export function recordPopupExportDownloadLease(args: {
  jobId: string;
  leaseId: string;
  leaseUrl: string;
  operationId: string;
}): Promise<void> {
  return mutateRecord((record) => {
    if (
      !record ||
      record.status.jobId !== args.jobId ||
      record.output?.downloadOperationId !== args.operationId ||
      record.output.phase !== 'prepared'
    )
      throw new Error('Page Package download lease does not match its prepared operation.');
    return {
      ...record,
      output: {
        ...record.output,
        leaseUrl: args.leaseUrl,
        phase: 'leased',
        urlLeaseId: args.leaseId,
      },
    };
  });
}

export function recordPopupExportDownloadStarting(args: {
  jobId: string;
  operationId: string;
  requestedAt: number;
}): Promise<void> {
  return mutateRecord((record) => {
    if (
      !record ||
      record.status.jobId !== args.jobId ||
      record.output?.downloadOperationId !== args.operationId ||
      record.output.phase !== 'leased' ||
      !record.output.leaseUrl
    )
      throw new Error('Page Package download is not durably leased.');
    return {
      ...record,
      output: {
        ...record.output,
        downloadRequestedAt: args.requestedAt,
        phase: 'starting-download',
      },
    };
  });
}

export function recordPopupExportDownloadStarted(args: {
  downloadId: number;
  jobId: string;
  operationId: string;
}): Promise<void> {
  return mutateRecord((record) => {
    if (
      !record ||
      record.status.jobId !== args.jobId ||
      record.output?.downloadOperationId !== args.operationId ||
      (record.output.phase !== 'starting-download' &&
        record.output.phase !== 'ambiguous-download') ||
      record.output.downloadId !== null
    )
      throw new Error('Page Package browser download does not match its starting operation.');
    return {
      ...record,
      output: { ...record.output, downloadId: args.downloadId, phase: 'downloading' },
    };
  });
}

export function recordPagePackageOutputAmbiguous(args: {
  error: string;
  jobId: string;
  operationId: string;
}): Promise<void> {
  return mutateRecord((record) => {
    if (
      !record ||
      record.status.jobId !== args.jobId ||
      record.output?.downloadOperationId !== args.operationId
    )
      return record;
    return {
      ...record,
      output: {
        ...record.output,
        cleanupError: boundPagePackageCleanupError(args.error),
        phase: 'ambiguous-download',
      },
    };
  });
}

export function recordPagePackageOutputCleanupFailed(args: {
  error: string;
  jobId: string;
  operationId: string;
}): Promise<void> {
  return mutateRecord((record) => {
    if (
      !record ||
      record.status.jobId !== args.jobId ||
      record.output?.downloadOperationId !== args.operationId
    )
      return record;
    return {
      ...record,
      output: {
        ...record.output,
        cleanupError: boundPagePackageCleanupError(args.error),
        phase: 'cleanup-failed',
      },
    };
  });
}

export async function cleanupRecordedPagePackageOutput(args: {
  jobId: string;
  operationId: string;
}): Promise<void> {
  const recovery = await readPagePackageJobRecoveryState();
  const output =
    recovery?.jobId === args.jobId && recovery.output?.downloadOperationId === args.operationId
      ? recovery.output
      : null;
  if (!output) return;
  if (!output.journalVerified) {
    const error = 'Page Package output journal ownership could not be verified.';
    await recordPagePackageOutputCleanupFailed({ ...args, error });
    throw new Error(error);
  }
  const sharedStagedPage = recovery!.stagedPages.find((page) =>
    sameAssetRef(page.assetRef, output.assetRef)
  );
  if (sharedStagedPage) {
    const error = 'Page Package output has conflicting staged ownership.';
    await recordPagePackageOutputCleanupFailed({ ...args, error });
    throw new Error(error);
  }
  try {
    await discardPreparedAsset(output.assetRef.assetId);
    await mutateRecord((record) =>
      record?.status.jobId === args.jobId && record.output?.downloadOperationId === args.operationId
        ? { ...record, output: null }
        : record
    );
    await deleteReadyJournal(output.assetJournalId).catch(() => undefined);
  } catch (error) {
    await recordPagePackageOutputCleanupFailed({
      ...args,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function recordPopupExportStagedPage(
  binding: { jobId: string; ordinal: number; stagedBlobId: string; tabId: number },
  prepared: PreparedAssetObject
): Promise<void> {
  const journal = await createAssetPublicationJournal({
    assetRefs: [prepared.ref],
    domain: PAGE_PACKAGE_JOB_JOURNAL_DOMAIN,
    payload: { ...binding, kind: 'staged-page' as const },
  });
  try {
    await mutateRecord((record) => {
      if (
        !record ||
        record.status.jobId !== binding.jobId ||
        record.status.phase !== 'running' ||
        record.status.orderedTabs[binding.ordinal]?.tabId !== binding.tabId
      )
        throw new Error('Cannot persist a staged page outside its active Page Package job.');
      if (
        record.stagedPages.some(
          (page) => page.stagedBlobId === binding.stagedBlobId || page.ordinal === binding.ordinal
        )
      )
        throw new Error('Page Package staged page was already persisted.');
      return {
        ...record,
        stagedPages: [
          ...record.stagedPages,
          {
            assetJournalId: journal.journalId,
            assetRef: prepared.ref,
            cleanupError: null,
            ...binding,
            phase: 'ready' as const,
          },
        ],
      };
    });
  } catch (error) {
    try {
      await deleteReadyJournal(journal.journalId);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Page Package staged admission cleanup failed.',
        { cause: cleanupError }
      );
    }
    throw error;
  }
}

export async function removePopupExportStagedPage(binding: {
  jobId: string;
  ordinal: number;
  stagedBlobId: string;
  tabId: number;
}): Promise<void> {
  const recovery = await readPagePackageJobRecoveryState();
  const page =
    recovery?.jobId === binding.jobId
      ? recovery.stagedPages.find(
          (candidate) =>
            candidate.ordinal === binding.ordinal &&
            candidate.stagedBlobId === binding.stagedBlobId &&
            candidate.tabId === binding.tabId
        )
      : null;
  if (!page) return;
  if (!page.journalVerified)
    throw new Error('Page Package staged journal ownership could not be verified.');
  await discardPreparedAsset(page.assetRef.assetId);
  await mutateRecord((current) =>
    current?.status.jobId === binding.jobId
      ? {
          ...current,
          stagedPages: current.stagedPages.filter(
            (candidate) => candidate.stagedBlobId !== binding.stagedBlobId
          ),
        }
      : current
  );
  await deleteReadyJournal(page.assetJournalId).catch(() => undefined);
}

async function cleanupStoredStagedPage(
  page: PersistedStagedPage & { journalVerified: boolean }
): Promise<void> {
  if (!page.journalVerified) {
    const error = 'Page Package staged journal ownership could not be verified.';
    await mutateRecord((record) =>
      record
        ? {
            ...record,
            stagedPages: record.stagedPages.map((candidate) =>
              candidate.stagedBlobId === page.stagedBlobId
                ? { ...candidate, cleanupError: error, phase: 'cleanup-failed' }
                : candidate
            ),
          }
        : record
    );
    throw new Error(error);
  }
  try {
    await discardPreparedAsset(page.assetRef.assetId);
    await mutateRecord((record) =>
      record
        ? {
            ...record,
            stagedPages: record.stagedPages.filter(
              (candidate) => candidate.stagedBlobId !== page.stagedBlobId
            ),
          }
        : record
    );
    await deleteReadyJournal(page.assetJournalId).catch(() => undefined);
  } catch (error) {
    await mutateRecord((record) =>
      record
        ? {
            ...record,
            stagedPages: record.stagedPages.map((candidate) =>
              candidate.stagedBlobId === page.stagedBlobId
                ? {
                    ...candidate,
                    cleanupError: boundPagePackageCleanupError(
                      error instanceof Error ? error.message : String(error)
                    ),
                    phase: 'cleanup-failed',
                  }
                : candidate
            ),
          }
        : record
    );
    throw error;
  }
}

export async function interruptStoredPopupExportJob(expectedJobId: string): Promise<void> {
  const recovery = await readPagePackageJobRecoveryState();
  if (!recovery || recovery.jobId !== expectedJobId) return;
  if (recovery.status.phase === 'running' || recovery.status.phase === 'cancelling') {
    await writePagePackageJobStatus({
      ...recovery.status,
      revision: recovery.status.revision + 1,
      phase: 'interrupted',
      progress: {
        ...recovery.status.progress,
        phase: 'error',
        message: translate('popup.export.jobInterruptedMessage'),
      },
    });
  }
  const retainedOutputAssetId = recovery.output?.assetRef.assetId ?? null;
  const cleanup = await Promise.allSettled(
    recovery.stagedPages
      .filter((page) => page.assetRef.assetId !== retainedOutputAssetId)
      .map(cleanupStoredStagedPage)
  );
  const failures = cleanup.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
  if (failures.length > 0)
    throw new AggregateError(failures, 'Interrupted Page Package staged cleanup failed.');
}

export async function hasUnresolvedPagePackageResources(): Promise<boolean> {
  await mutationQueue;
  const record = await readRecordUnlocked();
  return (
    !!record &&
    (record.libraryCleanupAssetIds.length > 0 ||
      record.output !== null ||
      record.stagedPages.length > 0)
  );
}

export async function clearPagePackageJobStatus(expectedJobId: string): Promise<boolean> {
  let cleared = false;
  await mutateRecord((record) => {
    if (!record || record.status.jobId !== expectedJobId) return record;
    if (record.libraryCleanupAssetIds.length > 0 || record.output || record.stagedPages.length > 0)
      throw new Error('Page Package cleanup is incomplete.');
    cleared = true;
    return null;
  });
  return cleared;
}
