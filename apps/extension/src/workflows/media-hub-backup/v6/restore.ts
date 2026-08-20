import {
  abortArchiveRestoreSession,
  beginArchiveRestoreRoot,
  completeArchiveRestoreSession,
  createAssetPublicationJournal,
  deleteReadyJournal,
  discardPreparedAsset,
  publishReadyJournalWithRetry,
  readArchiveRestoreSession,
  runWithDurableAssetOperation,
  type ArchiveRestoreSession,
  type AssetReadyJournal,
} from '../../../composition/persistence/assets';
import {
  openArchiveReader,
  type ArchiveTransferProgress,
  type ArchiveRootDescriptor,
} from '../../../composition/archive-transfer';
import { parseCatalog } from './catalog';
import { parseBoundedJson, parseRootEnvelope } from './codec';
import {
  MAX_CATALOG_SHARD_BYTES,
  MAX_ROOT_METADATA_BYTES,
  type MediaHubBackupRootEnvelope,
} from './contracts';
import { verifyMediaHubRestoreResume } from './restore-session';
import { stageArchiveRootObjects, type StagedArchiveObject } from './staging';

export interface ArchiveRootPublicationResult {
  conflicted: boolean;
  imported: boolean;
  retainedAssetIds: string[];
}

export interface ArchiveRootPublisher {
  profile: string;
  prepareStaged?(args: {
    envelope: MediaHubBackupRootEnvelope;
    staged: StagedArchiveObject[];
  }): Promise<{ envelope: MediaHubBackupRootEnvelope; staged: StagedArchiveObject[] }>;
  checkpointSkipIfExisting?(args: {
    envelope: MediaHubBackupRootEnvelope;
    session: ArchiveRestoreSession;
  }): Promise<boolean>;
  publish(args: {
    envelope: MediaHubBackupRootEnvelope;
    journal: AssetReadyJournal;
    session: ArchiveRestoreSession;
    staged: StagedArchiveObject[];
  }): Promise<ArchiveRootPublicationResult>;
}

function profile(descriptor: ArchiveRootDescriptor): string {
  return descriptor.rootKind === 'media' ? `media:${descriptor.mediaSubtype}` : descriptor.rootKind;
}

function rootKey(descriptor: ArchiveRootDescriptor): string {
  return `${profile(descriptor)}:${descriptor.rootId}`;
}

async function cleanupStaged(staged: readonly StagedArchiveObject[]): Promise<void> {
  const results = await Promise.allSettled(
    staged.map((object) => discardPreparedAsset(object.ref.assetId))
  );
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
  if (failures.length > 0) throw new AggregateError(failures, 'Archive restore cleanup failed.');
}

async function loadEnvelope(
  reader: Awaited<ReturnType<typeof openArchiveReader>>,
  descriptor: ArchiveRootDescriptor
): Promise<MediaHubBackupRootEnvelope> {
  const entry = reader.entry(descriptor.metadataPath);
  if (!entry) throw new Error(`Media backup root metadata is missing: ${descriptor.metadataPath}.`);
  const envelope = parseRootEnvelope(
    parseBoundedJson(await entry.text(MAX_ROOT_METADATA_BYTES), MAX_ROOT_METADATA_BYTES)
  );
  if (JSON.stringify(envelope.descriptor) !== JSON.stringify(descriptor)) {
    throw new Error('Media backup root descriptor changed after preflight.');
  }
  return envelope;
}

async function restoreArchiveRoot(args: {
  descriptor: ArchiveRootDescriptor;
  progress: ArchiveTransferProgress;
  publisher: ArchiveRootPublisher;
  reader: Awaited<ReturnType<typeof openArchiveReader>>;
  report(): void;
  session: ArchiveRestoreSession;
  signal?: AbortSignal;
}): Promise<ArchiveRestoreSession> {
  const key = rootKey(args.descriptor);
  let session = await beginArchiveRestoreRoot(args.session.operationId, key);
  let staged: StagedArchiveObject[] = [];
  let journal: AssetReadyJournal | null = null;
  try {
    let envelope = await loadEnvelope(args.reader, args.descriptor);
    if (
      session.strategy === 'skip' &&
      args.publisher.checkpointSkipIfExisting &&
      (await args.publisher.checkpointSkipIfExisting({ envelope, session }))
    ) {
      const current = await readArchiveRestoreSession(session.operationId);
      if (!current?.skippedRoots.includes(key)) {
        throw new Error('Media backup skipped root did not commit its session checkpoint.');
      }
      args.progress.currentFilename = null;
      args.progress.rootsComplete = current.committedRoots.length;
      args.report();
      return current;
    }
    staged = await stageArchiveRootObjects({
      envelope,
      reader: args.reader,
      onBytesRead(bytes, filename) {
        args.progress.bytesRead += bytes;
        args.progress.bytesWritten += bytes;
        args.progress.currentFilename = filename;
        args.report();
      },
      ...(args.signal ? { signal: args.signal } : {}),
    });
    if (args.publisher.prepareStaged) {
      const prepared = await args.publisher.prepareStaged({ envelope, staged });
      envelope = prepared.envelope;
      staged = prepared.staged;
    }
    journal = await createAssetPublicationJournal({
      assetRefs: staged.map((object) => object.ref),
      domain: 'archive-restore-root',
      operationId: session.operationId,
      payload: { rootKey: key },
    });
    let result: ArchiveRootPublicationResult | null = null;
    await publishReadyJournalWithRetry(journal, async (readyJournal) => {
      result = await args.publisher.publish({ envelope, journal: readyJournal, session, staged });
    });
    const retained = new Set(
      (result as ArchiveRootPublicationResult | null)?.retainedAssetIds ?? []
    );
    await cleanupStaged(staged.filter((object) => !retained.has(object.ref.assetId)));
    const current = await readArchiveRestoreSession(session.operationId);
    if (!current || !current.committedRoots.includes(key)) {
      throw new Error('Media backup root publication did not commit its session checkpoint.');
    }
    args.progress.currentFilename = null;
    args.progress.rootsComplete = current.committedRoots.length;
    args.report();
    return current;
  } catch (error) {
    const current = await readArchiveRestoreSession(session.operationId);
    if (current?.committedRoots.includes(key)) {
      if (journal) await deleteReadyJournal(journal.journalId).catch(() => undefined);
      return current;
    }
    if (journal) await deleteReadyJournal(journal.journalId).catch(() => undefined);
    await cleanupStaged(staged).catch((cleanupError: unknown) => {
      throw new AggregateError([error, cleanupError], 'Media backup restore rollback failed.', {
        cause: error,
      });
    });
    await abortArchiveRestoreSession(session.operationId).catch(() => undefined);
    throw error;
  }
}

export async function restoreMediaHubBackupV6(args: {
  file: Blob;
  operationId: string;
  onProgress?: (progress: ArchiveTransferProgress) => void;
  publishers: readonly ArchiveRootPublisher[];
  signal?: AbortSignal;
}): Promise<ArchiveRestoreSession> {
  return runWithDurableAssetOperation(async (permit) => {
    const { inspection, session: verifiedSession } = await verifyMediaHubRestoreResume({
      file: args.file,
      operationId: args.operationId,
      permit,
    });
    const publishers = new Map(args.publishers.map((publisher) => [publisher.profile, publisher]));
    const reader = await openArchiveReader(args.file);
    try {
      const progress: ArchiveTransferProgress = {
        bytesRead: 0,
        bytesWritten: 0,
        currentFilename: null,
        rootsComplete: verifiedSession.committedRoots.length,
      };
      const report = () => args.onProgress?.({ ...progress });
      let session = verifiedSession;
      for (const catalog of inspection.manifest.catalogs) {
        const entry = reader.entry(catalog.path);
        if (!entry) throw new Error(`Media backup catalog is missing: ${catalog.path}.`);
        const descriptors = parseCatalog(await entry.text(MAX_CATALOG_SHARD_BYTES));
        for (const descriptor of descriptors) {
          if (args.signal?.aborted) {
            throw new DOMException('Media backup restore was cancelled.', 'AbortError');
          }
          const key = rootKey(descriptor);
          if (session.committedRoots.includes(key)) continue;
          const publisher = publishers.get(profile(descriptor));
          if (!publisher)
            throw new Error(`Media backup root publisher is unavailable: ${profile(descriptor)}.`);
          session = await restoreArchiveRoot({
            descriptor,
            progress,
            publisher,
            reader,
            report,
            session,
            ...(args.signal ? { signal: args.signal } : {}),
          });
        }
      }
      return completeArchiveRestoreSession(session.operationId);
    } finally {
      await reader.close();
    }
  });
}
