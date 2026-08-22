import {
  createAssetPublicationJournal,
  discardPreparedAsset,
  publishReadyJournalWithRetry,
  writeBlobToAsset,
  type PreparedAssetObject,
} from '../assets';
import {
  sanitizeWebSnapshotManifestProvenance,
  sanitizeWebSnapshotPackageProvenance,
} from '../../../features/web-snapshot/provenance';
import type { SaveWebSnapshotMediaAssetInput } from '../media-library/contracts';
import type { StoredWebSnapshotRecord } from './contracts';
import { createWebSnapshotMediaEntry } from './media-entry';
import { markWebSnapshotProvenanceSanitized } from './provenance-state';
import {
  publishWebSnapshotJournal,
  recoverWebSnapshotPublications,
  WEB_SNAPSHOT_PUBLICATION_DOMAIN,
} from './publication';

function stageMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error');
}

async function runStage<T>(stage: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new Error(`${stage}: ${stageMessage(error)}`, { cause: error });
  }
}

async function discardPrepared(objects: readonly PreparedAssetObject[]): Promise<void> {
  const results = await Promise.allSettled(
    objects.map(({ ref }) => discardPreparedAsset(ref.assetId))
  );
  const errors = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
  if (errors.length > 0) throw new AggregateError(errors, 'Web snapshot asset cleanup failed.');
}

async function writeSnapshotObjects(
  packageBlob: Blob,
  screenshotBlob: Blob
): Promise<[PreparedAssetObject, PreparedAssetObject]> {
  const results = await Promise.allSettled([
    writeBlobToAsset(packageBlob),
    writeBlobToAsset(screenshotBlob),
  ]);
  const prepared = results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : []
  );
  const errors = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
  if (errors.length > 0) {
    try {
      await discardPrepared(prepared);
    } catch (cleanupError) {
      throw new AggregateError(
        [...errors, cleanupError],
        'Web snapshot object write and cleanup failed.',
        { cause: cleanupError }
      );
    }
    throw errors.length === 1
      ? errors[0]
      : new AggregateError(errors, 'Web snapshot object writes failed.');
  }
  return results.map((result) => (result as PromiseFulfilledResult<PreparedAssetObject>).value) as [
    PreparedAssetObject,
    PreparedAssetObject,
  ];
}

export async function saveWebSnapshotMediaAsset(
  input: SaveWebSnapshotMediaAssetInput
): Promise<{ assetId: string; snapshot: StoredWebSnapshotRecord }> {
  await recoverWebSnapshotPublications();
  const assetId = input.id ?? crypto.randomUUID();
  const now = Date.now();
  const sanitizedPackage = await runStage('sanitize saved web snapshot package', () =>
    sanitizeWebSnapshotPackageProvenance(input.packageBlob, input.manifest)
  );
  const [packageObject, screenshotObject] = await runStage('write web snapshot objects', () =>
    writeSnapshotObjects(sanitizedPackage.packageBlob, input.screenshotBlob)
  );
  const snapshot = markWebSnapshotProvenanceSanitized({
    id: assetId,
    packageAssetId: packageObject.ref.assetId,
    screenshotAssetId: screenshotObject.ref.assetId,
    screenshotMimeType: screenshotObject.ref.mimeType,
    screenshotSize: screenshotObject.ref.size,
    manifest: sanitizeWebSnapshotManifestProvenance(sanitizedPackage.manifest),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    size: packageObject.ref.size,
  });
  let journalCreated = false;
  try {
    const mediaEntry = await runStage('create web snapshot media entry', () =>
      createWebSnapshotMediaEntry({ assetId, input, now, snapshot })
    );
    const journal = await createAssetPublicationJournal({
      assetRefs: [packageObject.ref, screenshotObject.ref],
      domain: WEB_SNAPSHOT_PUBLICATION_DOMAIN,
      payload: { mediaEntry, snapshot },
    });
    journalCreated = true;
    await publishReadyJournalWithRetry(journal, publishWebSnapshotJournal);
    return { assetId, snapshot };
  } catch (error) {
    if (!journalCreated) {
      try {
        await discardPrepared([packageObject, screenshotObject]);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Web snapshot save cleanup failed.', {
          cause: cleanupError,
        });
      }
    }
    throw error;
  }
}
